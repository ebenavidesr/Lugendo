import { Router, type IRouter } from "express";
import { Readable } from "stream";
import multer from "multer";
import sharp from "sharp";
import { eq, and, or, ne, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable, tripsTable, invitationsTable, tripSharesTable,
  travelerProfilesTable, travelerTagCatalogTable, travelerTagsTable,
  userCountriesTable,
} from "@workspace/db";
import { COUNTRY_NAME_BY_CODE } from "@workspace/db/countries";
import { requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { TravelProfileVisibilityUpdateSchema, TravelerTagInputSchema } from "../lib/schemas";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { listTripMembers } from "./trips";

const objectStorage = new ObjectStorageService();
const router: IRouter = Router();

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_OUTPUT_SIZE = 512;

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!AVATAR_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_AVATAR_FORMAT"));
      return;
    }
    cb(null, true);
  },
});

// Roles allowed to see individual traveler tags in the back office (#155, decision 8).
// "local_guide" doesn't exist as a role yet (#91 is still in the backlog) -- listed here
// ahead of time so this endpoint needs no changes once that role ships.
const AGENCY_TAG_VIEWER_ROLES = ["admin", "manager", "agent", "local_guide"];

const TAG_AXIS_LIMITS: Record<string, number> = { estilo: 2, intereses: 8 };

class TagAlreadyAddedError extends Error {
  constructor() { super("AlreadyTagged"); }
}
class TagLimitExceededError extends Error {
  constructor(public axis: string, public limit: number) { super("LimitExceeded"); }
}

// Every trip a user is a member of: owner, accepted invitation, or accepted share. Mirrors
// the union already computed ad hoc in traveler.ts's GET /me/profile.
async function getUserTripIds(userId: number, userEmail: string): Promise<number[]> {
  const owned = (await db.select({ id: tripsTable.id }).from(tripsTable).where(eq(tripsTable.ownerId, userId))).map(r => r.id);
  const invited = (await db.select({ tripId: invitationsTable.tripId }).from(invitationsTable)
    .where(and(eq(invitationsTable.email, userEmail), eq(invitationsTable.status, "accepted")))).map(r => r.tripId);
  const shared = (await db.select({ tripId: tripSharesTable.tripId }).from(tripSharesTable)
    .where(and(
      or(eq(tripSharesTable.sharedWithUserId, userId), eq(tripSharesTable.sharedWithEmail, userEmail)),
      eq(tripSharesTable.status, "accepted"),
    ))).map(r => r.tripId);
  return [...new Set([...owned, ...invited, ...shared])];
}

// "Compañeros de viaje" (#155, decision 4): travelers who share at least one non-cancelled
// trip. Reuses listTripMembers (trips.ts) instead of reinventing the owner/invitation/share
// union it already encodes.
async function resolveTravelCompanionIds(userId: number): Promise<Set<number>> {
  const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!me) return new Set();

  const tripIds = await getUserTripIds(userId, me.email);
  if (tripIds.length === 0) return new Set();

  const activeTrips = await db.select({ id: tripsTable.id }).from(tripsTable)
    .where(and(inArray(tripsTable.id, tripIds), ne(tripsTable.status, "cancelled")));

  const companions = new Set<number>();
  for (const trip of activeTrips) {
    const members = await listTripMembers(trip.id);
    for (const m of members) {
      if (m.id !== userId) companions.add(m.id);
    }
  }
  return companions;
}

// Point of extension for #156 (red de favoritos, not yet built): once implemented, this
// should also return true when there's an accepted favorite relationship between the two.
async function canViewTravelProfile(viewerId: number, ownerId: number): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const companions = await resolveTravelCompanionIds(ownerId);
  return companions.has(viewerId);
}

async function getOrCreateProfile(userId: number) {
  await db.insert(travelerProfilesTable).values({ userId }).onConflictDoNothing({ target: travelerProfilesTable.userId });
  const [row] = await db.select().from(travelerProfilesTable).where(eq(travelerProfilesTable.userId, userId));
  return row;
}

async function getUserTags(userId: number) {
  return db.select({
    id: travelerTagCatalogTable.id,
    slug: travelerTagCatalogTable.slug,
    axis: travelerTagCatalogTable.axis,
    family: travelerTagCatalogTable.family,
    label: travelerTagCatalogTable.label,
    description: travelerTagCatalogTable.description,
  }).from(travelerTagsTable)
    .innerJoin(travelerTagCatalogTable, eq(travelerTagCatalogTable.id, travelerTagsTable.tagId))
    .where(eq(travelerTagsTable.userId, userId))
    .orderBy(travelerTagCatalogTable.sortOrder);
}

function avatarUrlFor(userId: number, avatarStorageKey: string | null): string | null {
  return avatarStorageKey ? `/api/travelers/${userId}/travel-profile/avatar` : null;
}

async function serializeOwnProfile(userId: number, profile: typeof travelerProfilesTable.$inferSelect) {
  return {
    avatarUrl: avatarUrlFor(userId, profile.avatarStorageKey),
    showVisitedCountries: profile.showVisitedCountries,
    showWantedCountries: profile.showWantedCountries,
    showTags: profile.showTags,
    agencyTagsConsent: profile.agencyTagsConsent,
    tags: await getUserTags(userId),
  };
}

// ─── Catálogo cerrado de etiquetas ─────────────────────────────────────────

router.get("/traveler-tag-catalog", requireRoles("traveler"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(travelerTagCatalogTable).orderBy(travelerTagCatalogTable.sortOrder);
  res.json(rows);
});

// ─── Mi perfil compartible ──────────────────────────────────────────────────

router.get("/me/travel-profile", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const profile = await getOrCreateProfile(userId);
  res.json(await serializeOwnProfile(userId, profile));
});

router.patch("/me/travel-profile", requireRoles("traveler"), validate(TravelProfileVisibilityUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  await getOrCreateProfile(userId);
  const { showVisitedCountries, showWantedCountries, showTags, agencyTagsConsent } = req.body as {
    showVisitedCountries?: boolean; showWantedCountries?: boolean; showTags?: boolean; agencyTagsConsent?: boolean;
  };

  const [updated] = await db.update(travelerProfilesTable).set({
    ...(showVisitedCountries !== undefined && { showVisitedCountries }),
    ...(showWantedCountries !== undefined && { showWantedCountries }),
    ...(showTags !== undefined && { showTags }),
    ...(agencyTagsConsent !== undefined && { agencyTagsConsent }),
  }).where(eq(travelerProfilesTable.userId, userId)).returning();

  res.json(await serializeOwnProfile(userId, updated));
});

router.post("/me/travel-profile/avatar", requireRoles("traveler"), (req, res, next) => {
  avatarUpload.single("avatar")(req, res, (err: unknown) => {
    if (!err) { next(); return; }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Ese archivo pesa demasiado. Prueba con uno de menos de 5 MB." });
      return;
    }
    if (err instanceof Error && err.message === "UNSUPPORTED_AVATAR_FORMAT") {
      res.status(400).json({ error: "Formato no soportado. Usa JPG, PNG o WebP." });
      return;
    }
    res.status(400).json({ error: "Error al subir el archivo" });
  });
}, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const file = req.file;
  if (!file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }

  let resized: Buffer;
  try {
    resized = await sharp(file.buffer)
      .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    req.log.warn({ err }, "Failed to process avatar image");
    res.status(400).json({ error: "No se pudo procesar la imagen" });
    return;
  }

  const profile = await getOrCreateProfile(userId);
  const objectPath = await objectStorage.uploadPrivateBuffer(resized, "traveler-avatars", ".jpg", "image/jpeg");

  if (profile.avatarStorageKey) {
    try {
      const old = await objectStorage.getObjectEntityFile(profile.avatarStorageKey);
      await old.delete();
    } catch (err) {
      if (!(err instanceof ObjectNotFoundError)) req.log.warn({ err }, "Failed to delete previous avatar");
    }
  }

  const [updated] = await db.update(travelerProfilesTable).set({ avatarStorageKey: objectPath })
    .where(eq(travelerProfilesTable.userId, userId)).returning();

  res.json(await serializeOwnProfile(userId, updated));
});

router.delete("/me/travel-profile/avatar", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const profile = await getOrCreateProfile(userId);

  if (profile.avatarStorageKey) {
    try {
      const old = await objectStorage.getObjectEntityFile(profile.avatarStorageKey);
      await old.delete();
    } catch (err) {
      if (!(err instanceof ObjectNotFoundError)) req.log.warn({ err }, "Failed to delete avatar");
    }
  }

  const [updated] = await db.update(travelerProfilesTable).set({ avatarStorageKey: null })
    .where(eq(travelerProfilesTable.userId, userId)).returning();

  res.json(await serializeOwnProfile(userId, updated));
});

// ─── Mis etiquetas ──────────────────────────────────────────────────────────

router.get("/me/travel-profile/tags", requireRoles("traveler"), async (req, res): Promise<void> => {
  res.json(await getUserTags(req.session.userId!));
});

router.post("/me/travel-profile/tags", requireRoles("traveler"), validate(TravelerTagInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { tagId } = req.body as { tagId: number };

  const [tag] = await db.select().from(travelerTagCatalogTable).where(eq(travelerTagCatalogTable.id, tagId));
  if (!tag) { res.status(404).json({ error: "Etiqueta no encontrada" }); return; }

  try {
    await db.transaction(async (tx) => {
      const existing = await tx.select({ tagId: travelerTagsTable.tagId })
        .from(travelerTagsTable)
        .innerJoin(travelerTagCatalogTable, eq(travelerTagCatalogTable.id, travelerTagsTable.tagId))
        .where(and(eq(travelerTagsTable.userId, userId), eq(travelerTagCatalogTable.axis, tag.axis)));

      if (existing.some(e => e.tagId === tagId)) throw new TagAlreadyAddedError();
      if (existing.length >= TAG_AXIS_LIMITS[tag.axis]) throw new TagLimitExceededError(tag.axis, TAG_AXIS_LIMITS[tag.axis]);

      await tx.insert(travelerTagsTable).values({ userId, tagId });
    });
  } catch (err) {
    if (err instanceof TagAlreadyAddedError) { res.status(409).json({ error: "AlreadyTagged" }); return; }
    if (err instanceof TagLimitExceededError) {
      res.status(409).json({ error: "LimitExceeded", axis: err.axis, limit: err.limit });
      return;
    }
    // Defensive fallback against the unique(userId, tagId) constraint for a genuine race
    // between two concurrent requests (the transaction check above isn't itself locking).
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "AlreadyTagged" });
      return;
    }
    throw err;
  }

  res.status(201).json(await getUserTags(userId));
});

router.delete("/me/travel-profile/tags/:tagId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tagId = parseInt(Array.isArray(req.params.tagId) ? req.params.tagId[0] : req.params.tagId, 10);

  const [row] = await db.delete(travelerTagsTable)
    .where(and(eq(travelerTagsTable.userId, userId), eq(travelerTagsTable.tagId, tagId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

// ─── Perfil visto por un compañero de viaje ────────────────────────────────

router.get("/travelers/:userId/travel-profile", requireRoles("traveler"), async (req, res): Promise<void> => {
  const viewerId = req.session.userId!;
  const ownerId = parseInt(Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId, 10);

  const [owner] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ownerId));
  if (!owner) { res.status(404).json({ error: "Not found" }); return; }

  if (!(await canViewTravelProfile(viewerId, ownerId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const profile = await getOrCreateProfile(ownerId);
  const result: {
    id: number; name: string; avatarUrl: string | null;
    visitedCountries?: string[]; wantedCountries?: string[];
    tags?: Awaited<ReturnType<typeof getUserTags>>;
  } = {
    id: owner.id,
    name: owner.name,
    avatarUrl: avatarUrlFor(owner.id, profile.avatarStorageKey),
  };

  if (profile.showVisitedCountries) {
    const rows = await db.select({ countryCode: userCountriesTable.countryCode }).from(userCountriesTable)
      .where(and(eq(userCountriesTable.userId, ownerId), eq(userCountriesTable.status, "visitado")));
    result.visitedCountries = rows.map(r => COUNTRY_NAME_BY_CODE[r.countryCode]).filter((n): n is string => !!n).sort();
  }
  if (profile.showWantedCountries) {
    const rows = await db.select({ countryCode: userCountriesTable.countryCode }).from(userCountriesTable)
      .where(and(eq(userCountriesTable.userId, ownerId), eq(userCountriesTable.status, "objetivo")));
    result.wantedCountries = rows.map(r => COUNTRY_NAME_BY_CODE[r.countryCode]).filter((n): n is string => !!n).sort();
  }
  if (profile.showTags) {
    result.tags = await getUserTags(ownerId);
  }

  res.json(result);
});

router.get("/travelers/:userId/travel-profile/avatar", requireRoles("traveler"), async (req, res): Promise<void> => {
  const viewerId = req.session.userId!;
  const ownerId = parseInt(Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId, 10);

  if (!(await canViewTravelProfile(viewerId, ownerId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [profile] = await db.select({ avatarStorageKey: travelerProfilesTable.avatarStorageKey })
    .from(travelerProfilesTable).where(eq(travelerProfilesTable.userId, ownerId));
  if (!profile?.avatarStorageKey) { res.status(404).json({ error: "No avatar" }); return; }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(profile.avatarStorageKey);
    const response = await objectStorage.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Not found" }); return; }
    req.log.error({ err: error }, "Error serving avatar");
    res.status(500).json({ error: "Failed to serve avatar" });
  }
});

// ─── Back office: etiquetas de un viajero, con consentimiento ─────────────

router.get("/agency/travelers/:userId/tags", requireRoles(...AGENCY_TAG_VIEWER_ROLES), async (req, res): Promise<void> => {
  const staffRole = req.session.role!;
  const staffAgencyId = req.session.agencyId;
  const travelerId = parseInt(Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId, 10);

  const [traveler] = await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, travelerId));
  if (!traveler || traveler.role !== "traveler") { res.status(404).json({ error: "Not found" }); return; }

  // Super-admin bypasses the agency check, matching verifyTripAccessCore elsewhere (trips.ts).
  if (staffRole !== "admin") {
    if (staffAgencyId == null) { res.status(403).json({ error: "Forbidden" }); return; }
    const tripIds = await getUserTripIds(traveler.id, traveler.email);
    const agencyTrips = tripIds.length
      ? await db.select({ id: tripsTable.id }).from(tripsTable)
        .where(and(inArray(tripsTable.id, tripIds), eq(tripsTable.agencyId, staffAgencyId)))
      : [];
    if (agencyTrips.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const profile = await getOrCreateProfile(traveler.id);
  if (!profile.agencyTagsConsent) {
    res.json({ consent: false, tags: [] });
    return;
  }
  res.json({ consent: true, tags: await getUserTags(traveler.id) });
});

export default router;
