import { Router, type IRouter } from "express";
import { and, eq, lte, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { itinerariesTable, agenciesTable, itineraryDaysTable } from "@workspace/db";
import { PublicItinerarySearchQuerySchema } from "../lib/schemas";

const router: IRouter = Router();

// Public catalog search (tarea #161) — deliberately mounted without requireAuth/requireRoles,
// the first business-data route in the repo that's reachable without a session.
router.get("/search/itineraries", async (req, res): Promise<void> => {
  const rawTripTypes = req.query.tripTypes;
  const tripTypes = Array.isArray(rawTripTypes) ? rawTripTypes : rawTripTypes != null ? [rawTripTypes] : undefined;

  const parsed = PublicItinerarySearchQuerySchema.safeParse({
    destination: req.query.destination,
    tripTypes,
    maxBudget: req.query.maxBudget,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { destination, tripTypes: filterTripTypes, maxBudget } = parsed.data;

  const conditions = [
    eq(itinerariesTable.publishedInSearch, true),
    eq(itinerariesTable.active, true),
    eq(agenciesTable.active, true),
  ];
  if (destination) {
    conditions.push(sql`(
      EXISTS (SELECT 1 FROM unnest(${itinerariesTable.countries}) c WHERE c ILIKE ${`%${destination}%`})
      OR ${itinerariesTable.region} ILIKE ${`%${destination}%`}
    )`);
  }
  if (filterTripTypes && filterTripTypes.length > 0) {
    // A JS array spliced directly into `sql` expands to comma-separated placeholders
    // (a row, not an array literal), so build the array explicitly with ARRAY[...].
    const tripTypeParams = sql.join(filterTripTypes.map(t => sql`${t}`), sql.raw(", "));
    conditions.push(sql`${itinerariesTable.tripTypes} && ARRAY[${tripTypeParams}]::text[]`);
  }
  if (maxBudget != null) {
    // Un itinerario sin precio orientativo informado no puede garantizar que encaja
    // en el presupuesto, así que se excluye en vez de asumir que sí encaja.
    conditions.push(lte(itinerariesTable.priceFrom, maxBudget));
  }

  const rows = await db
    .select({
      id: itinerariesTable.id,
      name: itinerariesTable.name,
      numDays: itinerariesTable.numDays,
      countries: itinerariesTable.countries,
      region: itinerariesTable.region,
      tripTypes: itinerariesTable.tripTypes,
      priceFrom: itinerariesTable.priceFrom,
      agencyId: agenciesTable.id,
      agencyName: agenciesTable.name,
      agencySlug: agenciesTable.slug,
      agencyLogoUrl: sql<string | null>`COALESCE(${agenciesTable.logoFileUrl}, ${agenciesTable.logoUrl})`,
    })
    .from(itinerariesTable)
    .innerJoin(agenciesTable, eq(itinerariesTable.agencyId, agenciesTable.id))
    .where(and(...conditions))
    .orderBy(itinerariesTable.createdAt);

  const ids = rows.map(r => r.id);
  const covers = ids.length === 0 ? [] : await db
    .select({ itineraryId: itineraryDaysTable.itineraryId, photoUrl: itineraryDaysTable.photoUrl })
    .from(itineraryDaysTable)
    .where(and(inArray(itineraryDaysTable.itineraryId, ids), eq(itineraryDaysTable.dayNumber, 1)));
  const coverMap = Object.fromEntries(covers.map(c => [c.itineraryId, c.photoUrl]));

  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    numDays: r.numDays,
    countries: r.countries,
    region: r.region,
    tripTypes: r.tripTypes,
    priceFrom: r.priceFrom,
    coverPhotoUrl: coverMap[r.id] ?? null,
    agency: { id: r.agencyId, name: r.agencyName, slug: r.agencySlug, logoUrl: r.agencyLogoUrl },
  })));
});

export default router;
