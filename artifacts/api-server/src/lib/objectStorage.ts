import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
const PUBLIC_PREFIX = "public";
const PRIVATE_PREFIX = "private";

export const objectStorageClient = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

interface ObjectHandleMetadata {
  contentType?: string;
  size?: number;
  metadata: Record<string, string>;
}

export class ObjectHandle {
  constructor(public readonly key: string) {}

  get name(): string {
    return this.key;
  }

  async exists(): Promise<boolean> {
    try {
      await objectStorageClient.send(
        new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: this.key })
      );
      return true;
    } catch (err) {
      if (isNotFoundError(err)) {
        return false;
      }
      throw err;
    }
  }

  async getMetadata(): Promise<ObjectHandleMetadata> {
    const res = await objectStorageClient.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: this.key })
    );
    return {
      contentType: res.ContentType,
      size: res.ContentLength,
      metadata: res.Metadata || {},
    };
  }

  async setMetadata(opts: { metadata: Record<string, string> }): Promise<void> {
    const current = await objectStorageClient.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: this.key })
    );
    await objectStorageClient.send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: this.key,
        CopySource: `${R2_BUCKET_NAME}/${this.key}`,
        ContentType: current.ContentType,
        Metadata: { ...(current.Metadata || {}), ...opts.metadata },
        MetadataDirective: "REPLACE",
      })
    );
  }

  async delete(): Promise<void> {
    await objectStorageClient.send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: this.key })
    );
  }

  async createReadStream(): Promise<Readable> {
    const res = await objectStorageClient.send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: this.key })
    );
    return res.Body as Readable;
  }
}

function isNotFoundError(err: unknown): boolean {
  const e = err as { $metadata?: { httpStatusCode?: number }; name?: string };
  return e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound";
}

export class ObjectStorageService {
  constructor() {}

  async searchPublicObject(filePath: string): Promise<ObjectHandle | null> {
    const handle = new ObjectHandle(`${PUBLIC_PREFIX}/${filePath}`);
    return (await handle.exists()) ? handle : null;
  }

  async downloadObject(file: ObjectHandle, cacheTtlSec: number = 3600): Promise<Response> {
    const metadata = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = await file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(visibility: "public" | "private" = "private"): Promise<string> {
    const objectId = randomUUID();
    const key = visibility === "public"
      ? `${PUBLIC_PREFIX}/day-photos/${objectId}`
      : `${PRIVATE_PREFIX}/uploads/${objectId}`;

    return getSignedUrl(
      objectStorageClient,
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
      { expiresIn: 900 }
    );
  }

  // Direct server-side upload of an already-validated buffer (as opposed to the presigned-URL
  // flow above, which uploads straight from the client). Used when the backend needs to inspect
  // or sanitize the content before it lands in storage. Returns the path segment expected after
  // GET /storage/public-objects/ -- build the display URL as `/api/storage/public-objects/${result}`.
  async uploadPublicBuffer(buffer: Buffer, folder: string, extension: string, contentType: string): Promise<string> {
    const objectId = randomUUID();
    const key = `${PUBLIC_PREFIX}/${folder}/${objectId}${extension}`;
    await objectStorageClient.send(
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType })
    );
    return `${folder}/${objectId}${extension}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<ObjectHandle> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const entityId = objectPath.slice("/objects/".length);
    if (!entityId) {
      throw new ObjectNotFoundError();
    }

    const handle = new ObjectHandle(`${PRIVATE_PREFIX}/${entityId}`);
    if (!(await handle.exists())) {
      throw new ObjectNotFoundError();
    }
    return handle;
  }

  // For private objects, returns "/objects/{entityId}" (consumed by the authenticated
  // GET /storage/objects/*path route). For public objects, returns the bare "{entityId}"
  // path segment expected after GET /storage/public-objects/ (no per-feature ACL there).
  normalizeObjectEntityPath(rawPath: string, visibility: "public" | "private" = "private"): string {
    const r2Origin = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    if (!rawPath.startsWith(r2Origin)) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const bucketPrefix = `/${R2_BUCKET_NAME}/`;
    if (!url.pathname.startsWith(bucketPrefix)) {
      return url.pathname;
    }
    const key = url.pathname.slice(bucketPrefix.length);

    if (visibility === "public") {
      const publicPrefix = `${PUBLIC_PREFIX}/`;
      if (!key.startsWith(publicPrefix)) return url.pathname;
      return key.slice(publicPrefix.length);
    }

    const privatePrefix = `${PRIVATE_PREFIX}/`;
    if (!key.startsWith(privatePrefix)) {
      return url.pathname;
    }

    const entityId = key.slice(privatePrefix.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async getSignedDownloadUrl(objectPath: string, ttlSec: number = 900): Promise<string> {
    const objectFile = await this.getObjectEntityFile(objectPath);
    return getSignedUrl(
      objectStorageClient,
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectFile.key }),
      { expiresIn: ttlSec }
    );
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: ObjectHandle;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
