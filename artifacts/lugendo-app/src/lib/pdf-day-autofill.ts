import type { Activity, ActivityInputCategory, Hotel, ParsedActivity, ParsedHotel } from "@workspace/api-client-react";

const ACTIVITY_TYPE_TO_CATEGORY: Record<string, ActivityInputCategory> = {
  Visita: "excursion",
  Gastronomía: "gastronomic",
  Traslado: "other",
  Libre: "other",
  Vuelo: "other",
  Actividad: "other",
};

type ParsedDayActivities = {
  activities?: string[] | null;
  parsedActivities?: ParsedActivity[] | null;
};

type ParsedDayHotel = {
  hotel?: ParsedHotel | null;
  cityFrom?: string | null;
  cityTo?: string | null;
};

/** Busca cada actividad detectada por IA en el catálogo (nombre exacto, sin distinguir mayúsculas); crea las que falten. */
export async function matchOrCreateActivityIds(
  day: ParsedDayActivities,
  catalogue: Activity[],
  createActivity: (input: { data: { name: string; category?: ActivityInputCategory } }) => Promise<{ id: number }>,
): Promise<number[]> {
  const parsedActs = day.parsedActivities?.length
    ? day.parsedActivities.map(pa => ({ name: pa.title, category: pa.type ? ACTIVITY_TYPE_TO_CATEGORY[pa.type] : undefined }))
    : (day.activities ?? []).map(name => ({ name, category: undefined as ActivityInputCategory | undefined }));

  const ids: number[] = [];
  for (const pa of parsedActs) {
    const trimmed = pa.name?.trim();
    if (!trimmed) continue;
    const existing = catalogue.find(a => a.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    try {
      const created = await createActivity({ data: { name: trimmed, ...(pa.category ? { category: pa.category } : {}) } });
      ids.push(created.id);
    } catch {
      // Sin coincidencia y sin poder crearla: se omite, queda como sugerencia informativa.
    }
  }
  return ids;
}

/**
 * Busca el hotel detectado por IA en el catálogo y lo asigna; si no existe, lo crea.
 * No auto-asigna cuando la propia IA marcó incertidumbre (`reviewManually`), o cuando
 * falta la ciudad, o cuando el itinerario no tiene un único país inequívoco para crear
 * el hotel — en esos casos se deja como sugerencia informativa para resolver a mano.
 */
export async function matchOrCreateHotelId(
  day: ParsedDayHotel,
  catalogue: Hotel[],
  createHotel: (input: { data: { name: string; city: string; country: string } }) => Promise<{ id: number }>,
  singleCountry: string | undefined,
): Promise<string | null> {
  const hotelName = day.hotel?.name?.trim();
  if (!hotelName || day.hotel?.reviewManually) return null;

  const existing = catalogue.find(h => h.name.toLowerCase() === hotelName.toLowerCase());
  if (existing) return String(existing.id);

  const city = day.cityTo ?? day.cityFrom ?? "";
  if (!city || !singleCountry) return null;

  try {
    const created = await createHotel({ data: { name: hotelName, city, country: singleCountry } });
    return String(created.id);
  } catch {
    return null;
  }
}
