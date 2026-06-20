import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable, tripDaysTable, tripDayHotelsTable, tripDayActivitiesTable,
  itinerariesTable, itineraryDaysTable, itineraryDayHotelsTable, itineraryDayActivitiesTable,
  hotelsTable, invitationsTable, agenciesTable, tripSharesTable, activitiesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

function serializeTrip(
  t: typeof tripsTable.$inferSelect & {
    itineraryName?: string | null;
    agencyName?: string | null;
    invitedCount?: number;
    acceptedCount?: number;
    createdByName?: string | null;
    travelers?: { name: string | null; email: string }[];
  }
) {
  return {
    ...t,
    itineraryName: t.itineraryName ?? null,
    agencyName: t.agencyName ?? null,
    invitedCount: t.invitedCount ?? 0,
    acceptedCount: t.acceptedCount ?? 0,
    createdByName: t.createdByName ?? null,
    travelers: t.travelers ?? [],
    createdAt: t.createdAt.toISOString(),
  };
}

function serializeDayHotel(r: {
  id: number; hotelId: number; hotelName: string; hotelCity: string | null;
  segment: string | null; createdAt: Date;
}) {
  return { id: r.id, hotelId: r.hotelId, hotelName: r.hotelName, hotelCity: r.hotelCity, segment: r.segment, createdAt: r.createdAt.toISOString() };
}

async function getTripDayHotelMap(dayIds: number[]) {
  if (dayIds.length === 0) return {} as Record<number, ReturnType<typeof serializeDayHotel>[]>;
  const rows = await db
    .select({
      id: tripDayHotelsTable.id,
      dayId: tripDayHotelsTable.tripDayId,
      hotelId: tripDayHotelsTable.hotelId,
      hotelName: hotelsTable.name,
      hotelCity: hotelsTable.city,
      segment: tripDayHotelsTable.segment,
      createdAt: tripDayHotelsTable.createdAt,
    })
    .from(tripDayHotelsTable)
    .innerJoin(hotelsTable, eq(tripDayHotelsTable.hotelId, hotelsTable.id))
    .where(inArray(tripDayHotelsTable.tripDayId, dayIds))
    .orderBy(tripDayHotelsTable.createdAt);
  const map: Record<number, ReturnType<typeof serializeDayHotel>[]> = {};
  for (const r of rows) {
    if (!map[r.dayId]) map[r.dayId] = [];
    map[r.dayId].push(serializeDayHotel({ ...r, hotelCity: r.hotelCity ?? null }));
  }
  return map;
}

router.get("/trips", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const baseRows = role === "admin"
    ? await db.select({ t: tripsTable, itineraryName: itinerariesTable.name, agencyName: agenciesTable.name })
        .from(tripsTable)
        .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
        .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
        .orderBy(tripsTable.startDate)
    : agencyId
      ? await db.select({ t: tripsTable, itineraryName: itinerariesTable.name, agencyName: agenciesTable.name })
          .from(tripsTable)
          .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
          .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
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

  const creatorIds = [...new Set(baseRows.map(r => r.t.createdBy).filter((id): id is number => id != null))];
  const creatorMap: Record<number, string> = {};
  if (creatorIds.length > 0) {
    const creators = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, creatorIds));
    for (const c of creators) creatorMap[c.id] = c.name;
  }

  const tripIds = baseRows.map(r => r.t.id);
  const travelersMap: Record<number, { name: string | null; email: string }[]> = {};
  if (tripIds.length > 0) {
    const accepted = await db
      .select({
        tripId: invitationsTable.tripId,
        email: invitationsTable.email,
        travelerName: usersTable.name,
      })
      .from(invitationsTable)
      .leftJoin(usersTable, eq(invitationsTable.travelerId, usersTable.id))
      .where(and(
        inArray(invitationsTable.tripId, tripIds),
        eq(invitationsTable.status, "accepted"),
      ));
    for (const row of accepted) {
      if (row.tripId != null) {
        if (!travelersMap[row.tripId]) travelersMap[row.tripId] = [];
        travelersMap[row.tripId].push({ name: row.travelerName ?? null, email: row.email });
      }
    }
  }

  res.json(baseRows.map(({ t, itineraryName, agencyName }) =>
    serializeTrip({
      ...t,
      itineraryName,
      agencyName,
      invitedCount: countMap[t.id]?.invited ?? 0,
      acceptedCount: countMap[t.id]?.accepted ?? 0,
      createdByName: t.createdBy != null ? (creatorMap[t.createdBy] ?? null) : null,
      travelers: travelersMap[t.id] ?? [],
    })
  ));
});

router.post("/trips", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const { name, description, itineraryId, startDate, endDate, maxCapacity, airline, flightNumber, flightTime, reservationCode, flightNotes, returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode, outboundFlights, returnFlights } = req.body;
  if (!name || !startDate) { res.status(400).json({ error: "name and startDate are required" }); return; }
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(400).json({ error: "No agency associated" }); return; }

  const [trip] = await db
    .insert(tripsTable)
    .values({ agencyId, itineraryId, name, description: description ?? null, startDate, endDate, maxCapacity, airline, flightNumber, flightTime, reservationCode, flightNotes, returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode, outboundFlights: outboundFlights ?? null, returnFlights: returnFlights ?? null, createdBy: req.session.userId })
    .returning();

  if (itineraryId) {
    const itinDays = await db
      .select()
      .from(itineraryDaysTable)
      .where(eq(itineraryDaysTable.itineraryId, itineraryId))
      .orderBy(itineraryDaysTable.dayNumber);

    if (itinDays.length > 0) {
      const tripDays = await db.insert(tripDaysTable).values(
        itinDays.map(d => ({
          tripId: trip.id,
          dayNumber: d.dayNumber,
          cityFrom: d.cityFrom,
          cityTo: d.cityTo,
          country: d.country,
          transport: d.transport,
          description: d.description,
        }))
      ).returning();

      // Copy hotel assignments from itinerary_day_hotels to trip_day_hotels
      const itinDayIds = itinDays.map(d => d.id);
      const itinHotels = itinDayIds.length > 0
        ? await db
            .select()
            .from(itineraryDayHotelsTable)
            .where(inArray(itineraryDayHotelsTable.itineraryDayId, itinDayIds))
        : [];

      if (itinHotels.length > 0) {
        // Build mapping: itinerary_day_id → trip_day_id
        const itinDayToTripDay: Record<number, number> = {};
        for (let i = 0; i < itinDays.length; i++) {
          const td = tripDays[i];
          if (td) itinDayToTripDay[itinDays[i].id] = td.id;
        }

        const hotelCopies = itinHotels
          .filter(h => itinDayToTripDay[h.itineraryDayId] !== undefined)
          .map(h => ({
            tripDayId: itinDayToTripDay[h.itineraryDayId],
            hotelId: h.hotelId,
            segment: h.segment,
          }));

        if (hotelCopies.length > 0) {
          await db.insert(tripDayHotelsTable).values(hotelCopies);
        }
      }

      // Copy activity assignments from itinerary_day_activities to trip_day_activities
      const itinActivities = itinDayIds.length > 0
        ? await db
            .select()
            .from(itineraryDayActivitiesTable)
            .where(inArray(itineraryDayActivitiesTable.dayId, itinDayIds))
        : [];

      if (itinActivities.length > 0) {
        const itinDayToTripDay: Record<number, number> = {};
        for (let i = 0; i < itinDays.length; i++) {
          const td = tripDays[i];
          if (td) itinDayToTripDay[itinDays[i].id] = td.id;
        }

        const activityCopies = itinActivities.filter(a => itinDayToTripDay[a.dayId] !== undefined);
        for (const a of activityCopies) {
          const tripDayId = itinDayToTripDay[a.dayId];
          await db.execute(sql`
            INSERT INTO trip_day_activities (day_id, activity_id, sort_order, notes, start_time)
            VALUES (${tripDayId}, ${a.activityId}, ${a.sortOrder}, ${a.notes ?? null}, ${a.startTime ?? null})
          `);
        }
      }
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
    .select()
    .from(tripDaysTable)
    .where(eq(tripDaysTable.tripId, id))
    .orderBy(tripDaysTable.dayNumber);

  const hotelMap = await getTripDayHotelMap(days.map(d => d.id));

  const invitations = await db
    .select({
      id: invitationsTable.id,
      tripId: invitationsTable.tripId,
      email: invitationsTable.email,
      inviteCode: invitationsTable.inviteCode,
      status: invitationsTable.status,
      segment: invitationsTable.segment,
      travelerId: invitationsTable.travelerId,
      createdAt: invitationsTable.createdAt,
      acceptedAt: invitationsTable.acceptedAt,
    })
    .from(invitationsTable)
    .where(eq(invitationsTable.tripId, id));

  res.json({
    ...serializeTrip({ ...row.t, itineraryName: row.itineraryName }),
    days: days.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), hotels: hotelMap[d.id] ?? [] })),
    invitations: invitations.map(i => ({
      ...i,
      segment: i.segment ?? null,
      travelerName: null,
      createdAt: i.createdAt.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
    })),
  });
});

// ─── TRIP DAY UPDATE (back-office) ───────────────────────────────────────────
router.patch("/trips/:tripId/days/:dayId", requireAuth, async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { cityFrom, cityTo, country, transport, description } = req.body as {
    cityFrom?: string | null; cityTo?: string | null; country?: string | null; transport?: string | null;
    description?: string | null;
  };
  const patch: Record<string, unknown> = {};
  if (cityFrom !== undefined) patch.cityFrom = cityFrom;
  if (cityTo !== undefined) patch.cityTo = cityTo;
  if (country !== undefined) patch.country = country;
  if (transport !== undefined) patch.transport = transport;
  if (description !== undefined) patch.description = description;

  const [updated] = await db
    .update(tripDaysTable)
    .set(patch)
    .where(and(eq(tripDaysTable.id, dayId), eq(tripDaysTable.tripId, tripId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  const hotelMap = await getTripDayHotelMap([updated.id]);
  res.json({ ...updated, hotels: hotelMap[updated.id] ?? [], createdAt: String(updated.createdAt) });
});

// ─── TRIP DAY HOTELS ─────────────────────────────────────────────────────────
router.get("/trips/:tripId/days/:dayId/hotels", requireAuth, async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const hotelMap = await getTripDayHotelMap([dayId]);
  res.json(hotelMap[dayId] ?? []);
});

router.post("/trips/:tripId/days/:dayId/hotels", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { hotelId, segment } = req.body as { hotelId: number; segment: "basic" | "standard" | "premium" };
  if (!hotelId || !segment) { res.status(400).json({ error: "hotelId and segment are required" }); return; }

  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, hotelId));
  if (!hotel) { res.status(404).json({ error: "Hotel not found" }); return; }

  const [assignment] = await db
    .insert(tripDayHotelsTable)
    .values({ tripDayId: dayId, hotelId, segment })
    .returning();

  res.status(201).json(serializeDayHotel({ id: assignment.id, hotelId: assignment.hotelId, hotelName: hotel.name, hotelCity: hotel.city ?? null, segment: assignment.segment, createdAt: assignment.createdAt }));
});

router.delete("/trips/:tripId/days/:dayId/hotels/:assignmentId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const assignmentId = parseInt(Array.isArray(req.params.assignmentId) ? req.params.assignmentId[0] : req.params.assignmentId, 10);
  await db.delete(tripDayHotelsTable).where(eq(tripDayHotelsTable.id, assignmentId));
  res.sendStatus(204);
});

// ─── TRIP DAY ACTIVITIES ─────────────────────────────────────────────────────
router.get("/trips/:tripId/days/:dayId/activities", requireAuth, async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const rows = await db.execute(sql`
    SELECT tda.id, tda.day_id, tda.activity_id, a.name as activity_name, a.category as activity_category,
           tda.sort_order, tda.start_time, tda.notes, tda.created_at,
           a.address as activity_address, a.duration_hours as activity_duration_hours
    FROM trip_day_activities tda
    JOIN activities a ON a.id = tda.activity_id
    WHERE tda.day_id = ${dayId}
    ORDER BY tda.sort_order, tda.created_at
  `);
  res.json((rows.rows as Array<Record<string, unknown>>).map(r => ({
    id: r.id,
    dayId: r.day_id,
    activityId: r.activity_id,
    activityName: r.activity_name,
    activityCategory: r.activity_category,
    sortOrder: r.sort_order,
    startTime: r.start_time ?? null,
    address: r.activity_address ?? null,
    durationHours: r.activity_duration_hours != null ? parseFloat(r.activity_duration_hours as string) : null,
    notes: r.notes ?? null,
    createdAt: String(r.created_at),
  })));
});

router.post("/trips/:tripId/days/:dayId/activities", requireAuth, async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { activityId, sortOrder = 0, notes, startTime } = req.body as { activityId: number; sortOrder?: number; notes?: string; startTime?: string };
  if (!activityId) { res.status(400).json({ error: "activityId is required" }); return; }

  const insertResult = await db.execute(sql`
    INSERT INTO trip_day_activities (day_id, activity_id, sort_order, notes, start_time)
    VALUES (${dayId}, ${activityId}, ${sortOrder}, ${notes ?? null}, ${startTime ?? null})
    RETURNING id, day_id, activity_id, sort_order, notes, start_time, created_at
  `);
  const link = insertResult.rows[0] as Record<string, unknown>;
  const [act] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, activityId));
  res.status(201).json({
    id: link.id,
    dayId: link.day_id,
    activityId: link.activity_id,
    activityName: act?.name ?? "",
    activityCategory: act?.category ?? null,
    sortOrder: link.sort_order,
    startTime: link.start_time ?? null,
    notes: link.notes,
    createdAt: String(link.created_at),
  });
});

router.patch("/trips/:tripId/days/:dayId/activities/:linkId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);

  // Verify the link belongs to the specified day which belongs to the specified trip (prevents IDOR)
  const [existing] = await db
    .select({ id: tripDayActivitiesTable.id, activityId: tripDayActivitiesTable.activityId })
    .from(tripDayActivitiesTable)
    .innerJoin(tripDaysTable, eq(tripDayActivitiesTable.dayId, tripDaysTable.id))
    .where(and(
      eq(tripDayActivitiesTable.id, linkId),
      eq(tripDayActivitiesTable.dayId, dayId),
      eq(tripDaysTable.tripId, tripId),
    ));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { startTime, notes } = req.body as { startTime?: string | null; notes?: string | null };
  const patch: Partial<{ startTime: string | null; notes: string | null }> = {};
  if (startTime !== undefined) patch.startTime = startTime ?? null;
  if (notes !== undefined) patch.notes = notes ?? null;

  const [updated] = await db
    .update(tripDayActivitiesTable)
    .set(patch)
    .where(eq(tripDayActivitiesTable.id, linkId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  const [act] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, updated.activityId));
  res.json({
    id: updated.id,
    dayId: updated.dayId,
    activityId: updated.activityId,
    activityName: act?.name ?? "",
    activityCategory: act?.category ?? null,
    sortOrder: updated.sortOrder,
    startTime: updated.startTime ?? null,
    address: act?.address ?? null,
    durationHours: act?.durationHours != null ? parseFloat(act.durationHours) : null,
    notes: updated.notes ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/trips/:tripId/days/:dayId/activities/:linkId", requireAuth, async (req, res): Promise<void> => {
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  await db.execute(sql`DELETE FROM trip_day_activities WHERE id = ${linkId}`);
  res.sendStatus(204);
});

router.get("/trips/:tripId/usage", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const shares = await db
    .select({ id: tripSharesTable.id, email: tripSharesTable.sharedWithEmail, status: tripSharesTable.status })
    .from(tripSharesTable)
    .where(and(eq(tripSharesTable.tripId, id), eq(tripSharesTable.status, "accepted")));
  const invites = await db
    .select({ id: invitationsTable.id, email: invitationsTable.email, status: invitationsTable.status })
    .from(invitationsTable)
    .where(and(eq(invitationsTable.tripId, id), eq(invitationsTable.status, "accepted")));
  const travelers = [
    ...shares.map(s => ({ id: s.id, email: s.email, status: "share" })),
    ...invites.map(i => ({ id: i.id, email: i.email, status: "invited" })),
  ];
  res.json({ travelers });
});

router.patch("/trips/:tripId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const fields = req.body;
  const [trip] = await db.update(tripsTable).set(fields).where(eq(tripsTable.id, id)).returning();
  if (!trip) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeTrip({ ...trip, itineraryName: null, invitedCount: 0, acceptedCount: 0 }));
});

router.delete("/trips/:tripId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { role, userId } = req.session;

  // Admins/managers can delete any trip; travelers can only delete their own
  if (role === "traveler") {
    const [owned] = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, id), eq(tripsTable.ownerId, userId!)));
    if (!owned) { res.status(403).json({ error: "No tienes permisos para eliminar este viaje" }); return; }
  } else if (role !== "admin" && role !== "manager") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Count accepted travelers (invitations + shares)
  const [inviteCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invitationsTable)
    .where(and(eq(invitationsTable.tripId, id), eq(invitationsTable.status, "accepted")));
  const [shareCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tripSharesTable)
    .where(and(eq(tripSharesTable.tripId, id), eq(tripSharesTable.status, "accepted")));
  const travelersAffected = (inviteCount?.count ?? 0) + (shareCount?.count ?? 0);

  if (travelersAffected > 0) {
    await db.update(tripsTable).set({ status: "cancelled" }).where(eq(tripsTable.id, id));
    res.json({ cancelled: true, travelersAffected });
  } else {
    await db.delete(tripsTable).where(eq(tripsTable.id, id));
    res.json({ cancelled: false, travelersAffected: 0 });
  }
});

export default router;
