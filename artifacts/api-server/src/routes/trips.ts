import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable, tripDaysTable, itinerariesTable, itineraryDaysTable,
  hotelsTable, invitationsTable, agenciesTable, tripSharesTable,
} from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

function serializeTrip(
  t: typeof tripsTable.$inferSelect & {
    itineraryName?: string | null;
    invitedCount?: number;
    acceptedCount?: number;
  }
) {
  return {
    ...t,
    itineraryName: t.itineraryName ?? null,
    invitedCount: t.invitedCount ?? 0,
    acceptedCount: t.acceptedCount ?? 0,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/trips", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const baseRows = role === "admin"
    ? await db.select({ t: tripsTable, itineraryName: itinerariesTable.name })
        .from(tripsTable)
        .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
        .orderBy(tripsTable.startDate)
    : agencyId
      ? await db.select({ t: tripsTable, itineraryName: itinerariesTable.name })
          .from(tripsTable)
          .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
          .where(eq(tripsTable.agencyId, agencyId))
          .orderBy(tripsTable.startDate)
      : [];

  const invCounts = await db
    .select({
      tripId: invitationsTable.tripId,
      invited: sql<number>`count(*)::int`,
      accepted: sql<number>`sum(case when status = 'accepted' then 1 else 0 end)::int`,
    })
    .from(invitationsTable)
    .groupBy(invitationsTable.tripId);
  const countMap: Record<number, { invited: number; accepted: number }> = {};
  for (const r of invCounts) {
    if (r.tripId) countMap[r.tripId] = { invited: r.invited, accepted: r.accepted };
  }

  res.json(baseRows.map(({ t, itineraryName }) =>
    serializeTrip({ ...t, itineraryName, invitedCount: countMap[t.id]?.invited ?? 0, acceptedCount: countMap[t.id]?.accepted ?? 0 })
  ));
});

router.post("/trips", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const { name, itineraryId, startDate, endDate, maxCapacity, airline, flightNumber, flightTime, reservationCode, flightNotes, returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode } = req.body;
  if (!name || !startDate) { res.status(400).json({ error: "name and startDate are required" }); return; }
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(400).json({ error: "No agency associated" }); return; }

  const [trip] = await db
    .insert(tripsTable)
    .values({ agencyId, itineraryId, name, startDate, endDate, maxCapacity, airline, flightNumber, flightTime, reservationCode, flightNotes, returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode, createdBy: req.session.userId })
    .returning();

  if (itineraryId) {
    const itinDays = await db
      .select()
      .from(itineraryDaysTable)
      .where(eq(itineraryDaysTable.itineraryId, itineraryId))
      .orderBy(itineraryDaysTable.dayNumber);
    if (itinDays.length > 0) {
      await db.insert(tripDaysTable).values(
        itinDays.map(d => ({
          tripId: trip.id,
          dayNumber: d.dayNumber,
          cityFrom: d.cityFrom,
          cityTo: d.cityTo,
          transport: d.transport,
          description: d.description,
          hotelId: d.hotelId,
        }))
      );
    }
  }

  res.status(201).json(serializeTrip({ ...trip, itineraryName: null, invitedCount: 0, acceptedCount: 0 }));
});

router.get("/trips/:tripId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const [row] = await db
    .select({ t: tripsTable, itineraryName: itinerariesTable.name })
    .from(tripsTable)
    .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
    .where(eq(tripsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const days = await db
    .select({
      id: tripDaysTable.id,
      tripId: tripDaysTable.tripId,
      dayNumber: tripDaysTable.dayNumber,
      cityFrom: tripDaysTable.cityFrom,
      cityTo: tripDaysTable.cityTo,
      transport: tripDaysTable.transport,
      description: tripDaysTable.description,
      hotelId: tripDaysTable.hotelId,
      hotelName: hotelsTable.name,
      createdAt: tripDaysTable.createdAt,
    })
    .from(tripDaysTable)
    .leftJoin(hotelsTable, eq(tripDaysTable.hotelId, hotelsTable.id))
    .where(eq(tripDaysTable.tripId, id))
    .orderBy(tripDaysTable.dayNumber);

  const invitations = await db
    .select({
      id: invitationsTable.id,
      tripId: invitationsTable.tripId,
      email: invitationsTable.email,
      inviteCode: invitationsTable.inviteCode,
      status: invitationsTable.status,
      travelerId: invitationsTable.travelerId,
      createdAt: invitationsTable.createdAt,
      acceptedAt: invitationsTable.acceptedAt,
    })
    .from(invitationsTable)
    .where(eq(invitationsTable.tripId, id));

  res.json({
    ...serializeTrip({ ...row.t, itineraryName: row.itineraryName }),
    days: days.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })),
    invitations: invitations.map(i => ({
      ...i,
      travelerName: null,
      createdAt: i.createdAt.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
    })),
  });
});

router.get("/trips/:tripId/usage", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const travelers = await db
    .select({ id: tripSharesTable.id, email: tripSharesTable.sharedWithEmail, status: tripSharesTable.status })
    .from(tripSharesTable)
    .where(eq(tripSharesTable.tripId, id));
  res.json({ travelers });
});

router.patch("/trips/:tripId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const fields = req.body;
  const [trip] = await db.update(tripsTable).set(fields).where(eq(tripsTable.id, id)).returning();
  if (!trip) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeTrip({ ...trip, itineraryName: null, invitedCount: 0, acceptedCount: 0 }));
});

router.delete("/trips/:tripId", requireRoles("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  await db.delete(tripsTable).where(eq(tripsTable.id, id));
  res.sendStatus(204);
});

export default router;
