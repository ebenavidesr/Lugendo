import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { itinerariesTable, itineraryDaysTable, hotelsTable, tripsTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

function serializeItinerary(i: typeof itinerariesTable.$inferSelect, tripCount = 0) {
  return { ...i, createdAt: i.createdAt.toISOString(), tripCount };
}

function serializeDay(d: typeof itineraryDaysTable.$inferSelect & { hotelName?: string | null }) {
  return { ...d, createdAt: d.createdAt.toISOString() };
}

router.get("/itineraries", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const rows = role === "admin"
    ? await db.select().from(itinerariesTable).orderBy(itinerariesTable.name)
    : agencyId
      ? await db.select().from(itinerariesTable).where(eq(itinerariesTable.agencyId, agencyId)).orderBy(itinerariesTable.name)
      : [];

  const tripCounts = await db
    .select({ itineraryId: tripsTable.itineraryId, count: sql<number>`count(*)::int` })
    .from(tripsTable)
    .groupBy(tripsTable.itineraryId);
  const countMap = Object.fromEntries(tripCounts.map(t => [t.itineraryId, t.count]));

  res.json(rows.map(i => serializeItinerary(i, countMap[i.id] ?? 0)));
});

router.post("/itineraries", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const { name, countries, region, numDays, difficulty, description, videoUrl } = req.body;
  if (!name || !numDays) {
    res.status(400).json({ error: "name and numDays are required" });
    return;
  }
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(400).json({ error: "No agency associated" }); return; }
  const [itinerary] = await db
    .insert(itinerariesTable)
    .values({ agencyId, name, countries: countries ?? [], region, numDays, difficulty, description, videoUrl })
    .returning();
  res.status(201).json(serializeItinerary(itinerary));
});

router.get("/itineraries/:itineraryId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const [itinerary] = await db.select().from(itinerariesTable).where(eq(itinerariesTable.id, id));
  if (!itinerary) { res.status(404).json({ error: "Not found" }); return; }

  const days = await db
    .select({
      id: itineraryDaysTable.id,
      itineraryId: itineraryDaysTable.itineraryId,
      dayNumber: itineraryDaysTable.dayNumber,
      cityFrom: itineraryDaysTable.cityFrom,
      cityTo: itineraryDaysTable.cityTo,
      transport: itineraryDaysTable.transport,
      description: itineraryDaysTable.description,
      hotelId: itineraryDaysTable.hotelId,
      hotelName: hotelsTable.name,
      createdAt: itineraryDaysTable.createdAt,
    })
    .from(itineraryDaysTable)
    .leftJoin(hotelsTable, eq(itineraryDaysTable.hotelId, hotelsTable.id))
    .where(eq(itineraryDaysTable.itineraryId, id))
    .orderBy(itineraryDaysTable.dayNumber);

  res.json({
    ...serializeItinerary(itinerary),
    days: days.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })),
  });
});

router.patch("/itineraries/:itineraryId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const fields = req.body;
  const [itinerary] = await db.update(itinerariesTable).set(fields).where(eq(itinerariesTable.id, id)).returning();
  if (!itinerary) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeItinerary(itinerary));
});

router.delete("/itineraries/:itineraryId", requireRoles("admin"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  await db.delete(itinerariesTable).where(eq(itinerariesTable.id, id));
  res.sendStatus(204);
});

router.get("/itineraries/:itineraryId/days", requireAuth, async (req, res): Promise<void> => {
  const itineraryId = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const days = await db
    .select({
      id: itineraryDaysTable.id,
      itineraryId: itineraryDaysTable.itineraryId,
      dayNumber: itineraryDaysTable.dayNumber,
      cityFrom: itineraryDaysTable.cityFrom,
      cityTo: itineraryDaysTable.cityTo,
      transport: itineraryDaysTable.transport,
      description: itineraryDaysTable.description,
      hotelId: itineraryDaysTable.hotelId,
      hotelName: hotelsTable.name,
      createdAt: itineraryDaysTable.createdAt,
    })
    .from(itineraryDaysTable)
    .leftJoin(hotelsTable, eq(itineraryDaysTable.hotelId, hotelsTable.id))
    .where(eq(itineraryDaysTable.itineraryId, itineraryId))
    .orderBy(itineraryDaysTable.dayNumber);
  res.json(days.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })));
});

router.post("/itineraries/:itineraryId/days", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const itineraryId = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const { dayNumber, cityFrom, cityTo, transport, description, hotelId } = req.body;
  if (!dayNumber) { res.status(400).json({ error: "dayNumber is required" }); return; }
  const [day] = await db
    .insert(itineraryDaysTable)
    .values({ itineraryId, dayNumber, cityFrom, cityTo, transport, description, hotelId })
    .returning();
  res.status(201).json({ ...day, createdAt: day.createdAt.toISOString(), hotelName: null });
});

router.patch("/itineraries/:itineraryId/days/:dayId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const fields = req.body;
  const [day] = await db.update(itineraryDaysTable).set(fields).where(eq(itineraryDaysTable.id, dayId)).returning();
  if (!day) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...day, createdAt: day.createdAt.toISOString(), hotelName: null });
});

router.delete("/itineraries/:itineraryId/days/:dayId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  await db.delete(itineraryDaysTable).where(eq(itineraryDaysTable.id, dayId));
  res.sendStatus(204);
});

export default router;
