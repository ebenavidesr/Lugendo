const MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

export interface GeocodeResult {
  lat: number;
  lng: number;
}

// Resolves a free-text city name (optionally qualified with a country) to coordinates via
// Mapbox's forward geocoding API. Returns null on any failure -- missing token, no match,
// network error, timeout -- so callers degrade gracefully: a city without coordinates just
// doesn't get a map pin, it never blocks saving a trip day.
export async function geocodeCity(city: string | null | undefined, country?: string | null): Promise<GeocodeResult | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  const trimmedCity = city?.trim();
  if (!token || !trimmedCity) return null;

  const query = country?.trim() ? `${trimmedCity}, ${country.trim()}` : trimmedCity;
  const url = `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(query)}.json?access_token=${token}&types=place&limit=1`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = await response.json() as { features?: { center?: [number, number] }[] };
    const center = data.features?.[0]?.center;
    if (!center || center.length !== 2) return null;
    const [lng, lat] = center;
    return { lat, lng };
  } catch {
    return null;
  }
}
