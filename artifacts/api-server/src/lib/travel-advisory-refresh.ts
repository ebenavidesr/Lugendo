import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db, tripsTable, tripDaysTable, itinerariesTable, countryAdvisoriesTable } from "@workspace/db";
import { logger } from "./logger";
import { scrapeCountryAdvisory, buildAdvisoryUrl } from "./travel-advisory-scraper";

export const SPAIN = "España";
const HORIZON_DAYS = 15;
const STALE_MS = 20 * 60 * 60 * 1000; // 20 hours

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function horizonISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + HORIZON_DAYS);
  return d.toISOString().slice(0, 10);
}

// Countries (excluding Spain) that appear on trips starting within the next HORIZON_DAYS days,
// or that are currently in progress (today falls between start and end date).
export async function getCountriesNeedingRefresh(): Promise<string[]> {
  const today = todayISO();
  const horizon = horizonISO();

  const relevantTrips = await db
    .select({ id: tripsTable.id, itineraryId: tripsTable.itineraryId })
    .from(tripsTable)
    .where(and(
      inArray(tripsTable.status, ["scheduled", "active"]),
      or(
        and(gte(tripsTable.startDate, today), lte(tripsTable.startDate, horizon)),
        and(lte(tripsTable.startDate, today), or(isNull(tripsTable.endDate), gte(tripsTable.endDate, today))),
      ),
    ));

  if (relevantTrips.length === 0) return [];

  const tripIds = relevantTrips.map(t => t.id);
  const itineraryIds = [...new Set(relevantTrips.map(t => t.itineraryId).filter((id): id is number => id != null))];

  const countries = new Set<string>();

  const dayCountryRows = await db
    .selectDistinct({ cityFromCountry: tripDaysTable.cityFromCountry, cityToCountry: tripDaysTable.cityToCountry })
    .from(tripDaysTable)
    .where(inArray(tripDaysTable.tripId, tripIds));
  for (const r of dayCountryRows) {
    if (r.cityFromCountry) countries.add(r.cityFromCountry);
    if (r.cityToCountry) countries.add(r.cityToCountry);
  }

  if (itineraryIds.length > 0) {
    const itinRows = await db
      .select({ countries: itinerariesTable.countries })
      .from(itinerariesTable)
      .where(inArray(itinerariesTable.id, itineraryIds));
    for (const r of itinRows) if (r.countries) for (const c of r.countries) countries.add(c);
  }

  countries.delete(SPAIN);
  return Array.from(countries).filter(Boolean).sort();
}

// Countries (excluding Spain) that appear on a single trip, combining trip_days.cityFromCountry/cityToCountry
// with the linked itinerary's countries list.
export async function getTripCountries(tripId: number): Promise<string[]> {
  const [trip] = await db
    .select({ itineraryId: tripsTable.itineraryId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));

  const countries = new Set<string>();

  const dayCountryRows = await db
    .selectDistinct({ cityFromCountry: tripDaysTable.cityFromCountry, cityToCountry: tripDaysTable.cityToCountry })
    .from(tripDaysTable)
    .where(eq(tripDaysTable.tripId, tripId));
  for (const r of dayCountryRows) {
    if (r.cityFromCountry) countries.add(r.cityFromCountry);
    if (r.cityToCountry) countries.add(r.cityToCountry);
  }

  if (trip?.itineraryId) {
    const [itin] = await db
      .select({ countries: itinerariesTable.countries })
      .from(itinerariesTable)
      .where(eq(itinerariesTable.id, trip.itineraryId));
    if (itin?.countries) for (const c of itin.countries) countries.add(c);
  }

  countries.delete(SPAIN);
  return Array.from(countries).filter(Boolean).sort();
}

export async function refreshCountryAdvisory(countryName: string): Promise<void> {
  const now = new Date();
  try {
    const scraped = await scrapeCountryAdvisory(countryName);

    const [existing] = await db
      .select({ contentHash: countryAdvisoriesTable.contentHash })
      .from(countryAdvisoriesTable)
      .where(eq(countryAdvisoriesTable.countryName, countryName));

    const changed = existing !== undefined && existing.contentHash !== scraped.contentHash;

    await db
      .insert(countryAdvisoriesTable)
      .values({
        countryName,
        sourceUrl: buildAdvisoryUrl(countryName),
        contentText: scraped.contentText,
        contentHash: scraped.contentHash,
        officialUpdatedAt: scraped.officialUpdatedAt,
        lastCheckedAt: now,
        lastChangedAt: changed || existing === undefined ? now : undefined,
        lastError: null,
      })
      .onConflictDoUpdate({
        target: countryAdvisoriesTable.countryName,
        set: {
          sourceUrl: buildAdvisoryUrl(countryName),
          contentText: scraped.contentText,
          contentHash: scraped.contentHash,
          officialUpdatedAt: scraped.officialUpdatedAt,
          lastCheckedAt: now,
          ...(changed ? { lastChangedAt: now } : {}),
          lastError: null,
        },
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ countryName, err: message }, "travel advisory refresh failed");

    await db
      .insert(countryAdvisoriesTable)
      .values({
        countryName,
        sourceUrl: buildAdvisoryUrl(countryName),
        lastCheckedAt: now,
        lastError: message,
      })
      .onConflictDoUpdate({
        target: countryAdvisoriesTable.countryName,
        set: { lastCheckedAt: now, lastError: message },
      });
  }
}

let isRunning = false;
let lastFullRunAt: number | null = null;

export async function runDueAdvisoryRefresh(): Promise<void> {
  if (isRunning) return;
  if (lastFullRunAt !== null && Date.now() - lastFullRunAt < STALE_MS) return;

  isRunning = true;
  try {
    const countries = await getCountriesNeedingRefresh();
    for (const country of countries) {
      await refreshCountryAdvisory(country);
    }
    lastFullRunAt = Date.now();
    logger.info({ countryCount: countries.length }, "travel advisory refresh run completed");
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "travel advisory refresh run failed");
  } finally {
    isRunning = false;
  }
}

export function scheduleAdvisoryRefresh(): void {
  void runDueAdvisoryRefresh();
  setInterval(() => { void runDueAdvisoryRefresh(); }, 60 * 60 * 1000);
}

// Lazy per-country refresh used by the traveler-facing endpoint: refreshes a single country
// on demand when its cached record is missing or older than STALE_MS, without waiting for
// the hourly batch job.
export async function ensureCountryAdvisoryFresh(countryName: string): Promise<void> {
  const [existing] = await db
    .select({ lastCheckedAt: countryAdvisoriesTable.lastCheckedAt })
    .from(countryAdvisoriesTable)
    .where(eq(countryAdvisoriesTable.countryName, countryName));

  const isStale = !existing || !existing.lastCheckedAt || Date.now() - existing.lastCheckedAt.getTime() > STALE_MS;
  if (isStale) {
    await refreshCountryAdvisory(countryName);
  }
}
