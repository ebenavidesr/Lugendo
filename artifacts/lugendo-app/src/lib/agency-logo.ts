import type { Agency } from "@workspace/api-client-react";

export const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
export const MAX_LOGO_SIZE = 2 * 1024 * 1024;

export function validateLogoFile(file: File): string | null {
  if (!ALLOWED_LOGO_MIME_TYPES.includes(file.type)) {
    return "Formato no soportado. Usa PNG, JPG, SVG o WebP.";
  }
  if (file.size > MAX_LOGO_SIZE) {
    return "Ese archivo pesa demasiado. Prueba con uno de menos de 2 MB.";
  }
  return null;
}

export async function uploadAgencyLogoFile(agencyId: number, file: File): Promise<Agency> {
  const formData = new FormData();
  formData.append("logo", file);
  const res = await fetch(`/api/agencies/${agencyId}/logo`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Error al subir el logo");
  }
  return res.json() as Promise<Agency>;
}
