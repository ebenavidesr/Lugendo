import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { agenciesTable, itinerariesTable, itineraryDaysTable } from "@workspace/db";

const router: IRouter = Router();

// Public agency profile (tarea #162) — mounted without requireAuth/requireRoles, same pattern
// as GET /search/itineraries. Only reachable when the agency has opted in via publicProfileEnabled;
// a disabled or missing agency both resolve to a plain 404, so the endpoint never confirms whether
// a given slug belongs to an agency that simply chose not to publish.
router.get("/agencies/public/:slug", async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [agency] = await db
    .select({
      id: agenciesTable.id,
      name: agenciesTable.name,
      slug: agenciesTable.slug,
      description: agenciesTable.description,
      primaryColor: agenciesTable.primaryColor,
      logoUrl: agenciesTable.logoUrl,
      logoFileUrl: agenciesTable.logoFileUrl,
      photoUrls: agenciesTable.photoUrls,
    })
    .from(agenciesTable)
    .where(and(eq(agenciesTable.slug, slug), eq(agenciesTable.active, true), eq(agenciesTable.publicProfileEnabled, true)));

  if (!agency) { res.status(404).json({ error: "Not found" }); return; }

  const itineraries = await db
    .select({
      id: itinerariesTable.id,
      name: itinerariesTable.name,
      numDays: itinerariesTable.numDays,
      countries: itinerariesTable.countries,
      region: itinerariesTable.region,
      tripTypes: itinerariesTable.tripTypes,
      priceFrom: itinerariesTable.priceFrom,
    })
    .from(itinerariesTable)
    .where(and(
      eq(itinerariesTable.agencyId, agency.id),
      eq(itinerariesTable.publishedInSearch, true),
      eq(itinerariesTable.active, true),
    ))
    .orderBy(itinerariesTable.createdAt);

  const ids = itineraries.map(i => i.id);
  const covers = ids.length === 0 ? [] : await db
    .select({ itineraryId: itineraryDaysTable.itineraryId, photoUrl: itineraryDaysTable.photoUrl })
    .from(itineraryDaysTable)
    .where(and(inArray(itineraryDaysTable.itineraryId, ids), eq(itineraryDaysTable.dayNumber, 1)));
  const coverMap = Object.fromEntries(covers.map(c => [c.itineraryId, c.photoUrl]));

  res.json({
    id: agency.id,
    name: agency.name,
    slug: agency.slug,
    description: agency.description,
    primaryColor: agency.primaryColor,
    logoUrl: agency.logoFileUrl ?? agency.logoUrl,
    photoUrls: agency.photoUrls,
    itineraries: itineraries.map(i => ({ ...i, coverPhotoUrl: coverMap[i.id] ?? null })),
  });
});

export default router;
