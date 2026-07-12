import { logger } from "./logger";

const MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

// place = cities/towns, locality/neighborhood = smaller towns and villages Mapbox doesn't
// classify as "place". Restricting to just "place" was the original bug: small towns (e.g.
// "Girithale" in Sri Lanka) have no "place" entry, so Mapbox fell back to a low-relevance
// fuzzy match on an unrelated location in a different country entirely (a real production
// case: "Girithale" matched "Lankaran, Azerbaijan" at relevance 0.43, purely on the substring
// "lanka"). The MIN_RELEVANCE check below is a second line of defense against that same
// failure mode for names too obscure to have any of these three types either.
const GEOCODE_TYPES = "place,locality,neighborhood";
const MIN_RELEVANCE = 0.5;

export interface GeocodeResult {
  lat: number;
  lng: number;
}

// Resolves a free-text city name (optionally qualified with a country) to coordinates via
// Mapbox's forward geocoding API. Returns null on any failure -- missing token, no match,
// network error, timeout, low-confidence match -- so callers degrade gracefully: a city
// without coordinates just doesn't get a map pin, it never blocks saving a trip day.
export async function geocodeCity(city: string | null | undefined, country?: string | null): Promise<GeocodeResult | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  const trimmedCity = city?.trim();
  if (!token || !trimmedCity) return null;

  const query = country?.trim() ? `${trimmedCity}, ${country.trim()}` : trimmedCity;
  const url = `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(query)}.json?access_token=${token}&types=${GEOCODE_TYPES}&limit=1`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      logger.warn({ city: trimmedCity, status: response.status }, "mapbox geocoding request failed");
      return null;
    }
    const data = await response.json() as { features?: { center?: [number, number]; relevance?: number; place_name?: string }[] };
    const feature = data.features?.[0];
    const center = feature?.center;
    if (!center || center.length !== 2) return null;
    if ((feature.relevance ?? 1) < MIN_RELEVANCE) {
      logger.warn({ city: trimmedCity, match: feature.place_name, relevance: feature.relevance }, "mapbox geocoding match rejected (low relevance)");
      return null;
    }
    const [lng, lat] = center;
    return { lat, lng };
  } catch (err) {
    logger.warn({ city: trimmedCity, err: err instanceof Error ? err.message : String(err) }, "mapbox geocoding request errored");
    return null;
  }
}
