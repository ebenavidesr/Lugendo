import type { Agency } from "@workspace/api-client-react";

export const ALLOWED_PHOTO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

export function validatePhotoFile(file: File): string | null {
  if (!ALLOWED_PHOTO_MIME_TYPES.includes(file.type)) {
    return "Formato no soportado. Usa PNG, JPG o WebP.";
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return "Ese archivo pesa demasiado. Prueba con uno de menos de 5 MB.";
  }
  return null;
}

export async function uploadAgencyPhotoFile(agencyId: number, file: File): Promise<Agency> {
  const formData = new FormData();
  formData.append("photo", file);
  const res = await fetch(`/api/agencies/${agencyId}/photos`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Error al subir la foto");
  }
  return res.json() as Promise<Agency>;
}
