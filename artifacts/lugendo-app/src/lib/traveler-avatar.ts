import type { MyTravelProfile } from "@workspace/api-client-react";

export const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export async function uploadTravelerAvatarBlob(blob: Blob): Promise<MyTravelProfile> {
  const formData = new FormData();
  formData.append("avatar", blob, "avatar.jpg");
  const res = await fetch("/api/me/travel-profile/avatar", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Error al subir la foto");
  }
  return res.json() as Promise<MyTravelProfile>;
}
