import { Router, type IRouter } from "express";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  tripsTable, tripDaysTable, invitationsTable,
  agenciesTable, hotelsTable, tripNotesTable, itinerariesTable,
  itineraryDaysTable, tripDayHotelsTable, itineraryDayHotelsTable,
  tripDayActivitiesTable, itineraryDayActivitiesTable,
  tripSharesTable, usersTable, activitiesTable,
} from "@workspace/db";
import { requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import {
  PersonalTripInputSchema, PersonalTripUpdateSchema,
  PersonalTripDayInputSchema, PersonalTripDayUpdateSchema,
  TripNoteInputSchema, TripNoteUpdateSchema,
  ShareTripInputSchema, UpdateShareInputSchema,
  TripDocumentInputSchema,
} from "../lib/schemas";
import { tripDocumentsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

function makeShareCode(): string {
  return randomBytes(6).toString("base64url").toUpperCase();
}

const router: IRouter = Router();

// ─── Helper: copy itinerary_days + activities + hotels → trip_days ────────────
async function copyItineraryDaysToTrip(tripId: number, itineraryId: number, creatorUserId: number): Promise<Array<typeof tripDaysTable.$inferSelect>> {
  // Guard: return existing trip_days if already migrated
  const existing = await db
    .select()
    .from(tripDaysTable)
    .where(eq(tripDaysTable.tripId, tripId))
    .orderBy(tripDaysTable.dayNumber);
  if (existing.length > 0) return existing;

  const itinDays = await db
    .select()
    .from(itineraryDaysTable)
    .where(eq(itineraryDaysTable.itineraryId, itineraryId))
    .orderBy(itineraryDaysTable.dayNumber);
  if (itinDays.length === 0) return [];

  const newTripDays = await db
    .insert(tripDaysTable)
    .values(itinDays.map(d => ({
      tripId,
      dayNumber: d.dayNumber,
      cityFrom: d.cityFrom ?? null,
      cityTo: d.cityTo ?? null,
      country: d.country ?? null,
      transport: d.transport ?? null,
      description: d.description ?? null,
    })))
    .returning();

  const dayMap = new Map<number, number>();
  itinDays.forEach((iday, idx) => { dayMap.set(iday.id, newTripDays[idx].id); });

  const itinActivities = await db
    .select()
    .from(itineraryDayActivitiesTable)
    .where(inArray(itineraryDayActivitiesTable.dayId, itinDays.map(d => d.id)));

  if (itinActivities.length > 0) {
    await db.insert(tripDayActivitiesTable).values(
      itinActivities
        .map(a => ({ dayId: dayMap.get(a.dayId)!, activityId: a.activityId, sortOrder: a.sortOrder, startTime: a.startTime ?? null, notes: a.notes ?? null, createdByUserId: creatorUserId }))
        .filter(a => a.dayId),
    );
  }

  const itinHotels = await db
    .select()
    .from(itineraryDayHotelsTable)
    .where(inArray(itineraryDayHotelsTable.itineraryDayId, itinDays.map(d => d.id)));

  if (itinHotels.length > 0) {
    await db.insert(tripDayHotelsTable).values(
      itinHotels
        .map(h => ({ tripDayId: dayMap.get(h.itineraryDayId)!, hotelId: h.hotelId, segment: h.segment }))
        .filter(h => h.tripDayId),
    );
  }

  return newTripDays;
}

function serializeDayHotel(r: {
  id: number; hotelId: number; hotelName: string; hotelCity: string | null;
  segment: string | null; createdAt: Date;
}) {
  return { id: r.id, hotelId: r.hotelId, hotelName: r.hotelName, hotelCity: r.hotelCity, segment: r.segment, createdAt: r.createdAt.toISOString() };
}

async function getTravelerDayHotelMap(dayIds: number[], kind: "trip" | "itinerary") {
  if (dayIds.length === 0) return {} as Record<number, ReturnType<typeof serializeDayHotel>[]>;
  const table = kind === "trip" ? tripDayHotelsTable : itineraryDayHotelsTable;
  const idCol = kind === "trip" ? tripDayHotelsTable.tripDayId : itineraryDayHotelsTable.itineraryDayId;
  const rows = await db
    .select({
      id: table.id,
      dayId: idCol,
      hotelId: table.hotelId,
      hotelName: hotelsTable.name,
      hotelCity: hotelsTable.city,
      segment: table.segment,
      createdAt: table.createdAt,
    })
    .from(table)
    .innerJoin(hotelsTable, eq(table.hotelId, hotelsTable.id))
    .where(inArray(idCol, dayIds))
    .orderBy(table.createdAt);
  const map: Record<number, ReturnType<typeof serializeDayHotel>[]> = {};
  for (const r of rows) {
    if (!map[r.dayId]) map[r.dayId] = [];
    map[r.dayId].push(serializeDayHotel({ ...r, hotelCity: r.hotelCity ?? null }));
  }
  return map;
}

async function getTripDayActivityMap(dayIds: number[], currentUserId?: number) {
  type ActivityItem = {
    id: number; activityId: number | null; activityName: string; activityCategory: string | null;
    startTime: string | null; endTime: string | null; address: string | null; addressOverride: string | null;
    durationHours: number | null; notes: string | null; companyContact: string | null;
    included: boolean; transportMode: string | null; canEdit: boolean;
  };
  if (dayIds.length === 0) return {} as Record<number, ActivityItem[]>;
  let rows: Awaited<ReturnType<typeof db.execute>>;
  try {
    rows = await db.execute(sql`
    SELECT
      tda.id, tda.day_id, tda.activity_id, tda.activity_title,
      a.name AS activity_name, a.category AS activity_category,
      tda.sort_order, tda.start_time, tda.end_time, tda.notes,
      tda.company_contact, tda.address_override, tda.included, tda.transport_mode,
      tda.created_by_user_id,
      a.address AS activity_address, a.duration_hours AS activity_duration_hours
    FROM trip_day_activities tda
    LEFT JOIN activities a ON a.id = tda.activity_id
    WHERE tda.day_id IN ${dayIds}
    ORDER BY
      tda.day_id,
      CASE WHEN tda.start_time IS NULL THEN 1 ELSE 0 END,
      tda.start_time ASC,
      tda.sort_order ASC,
      tda.created_at ASC
  `);
  } catch (err: unknown) {
    const cause = (err as { cause?: { message?: string } })?.cause;
    process.stderr.write(`[getTripDayActivityMap] pg error: ${cause?.message ?? String(err)}\n`);
    throw err;
  }
  const map: Record<number, ActivityItem[]> = {};
  for (const r of rows.rows as Array<Record<string, unknown>>) {
    const dayId = Number(r.day_id);
    if (!map[dayId]) map[dayId] = [];
    const canEdit = true;
    map[dayId].push({
      id: Number(r.id),
      activityId: r.activity_id != null ? Number(r.activity_id) : null,
      activityName: (r.activity_title as string | null) ?? (r.activity_name as string | null) ?? "",
      activityCategory: r.activity_category as string | null,
      startTime: r.start_time as string | null,
      endTime: r.end_time as string | null,
      notes: r.notes as string | null,
      companyContact: r.company_contact as string | null,
      addressOverride: r.address_override as string | null,
      address: (r.address_override as string | null) ?? (r.activity_address as string | null),
      durationHours: r.activity_duration_hours != null ? parseFloat(r.activity_duration_hours as string) : null,
      included: Boolean(r.included),
      transportMode: r.transport_mode as string | null,
      canEdit,
    });
  }
  return map;
}

// ─── Merge itinerary fallbacks into hotel/activity maps ──────────────────────
// For trip days that have NO hotels in trip_day_hotels, fall back to the
// corresponding itinerary_day_hotels (matched by day_number). Similarly, for
// trip_day_activities with a null startTime, fall back to the itinerary
// activity's startTime (matched by activityId + day_number). This handles the
// common case where the admin adds/edits data on the itinerary AFTER the trip
// was already created and copied.
async function mergeItineraryFallbacks(
  itineraryId: number | null,
  tripDays: Array<typeof tripDaysTable.$inferSelect>,
  hotelMap: Record<number, ReturnType<typeof serializeDayHotel>[]>,
  activityMap: Record<number, Array<{ startTime: string | null; activityId: number | null }>>,
): Promise<void> {
  if (!itineraryId || tripDays.length === 0) return;

  const itinDays = await db
    .select()
    .from(itineraryDaysTable)
    .where(eq(itineraryDaysTable.itineraryId, itineraryId))
    .orderBy(itineraryDaysTable.dayNumber);
  if (itinDays.length === 0) return;

  const dayNumToItinDay = new Map<number, typeof itinDays[0]>();
  for (const id of itinDays) dayNumToItinDay.set(id.dayNumber, id);

  // 1. Hotel fallback: days with no trip hotels → use itinerary hotels
  const tripDaysNoHotels = tripDays.filter(d => (hotelMap[d.id] ?? []).length === 0);
  if (tripDaysNoHotels.length > 0) {
    const itinDayIds = tripDaysNoHotels
      .map(d => dayNumToItinDay.get(d.dayNumber)?.id)
      .filter((id): id is number => id !== undefined);
    if (itinDayIds.length > 0) {
      const fallbackHotelMap = await getTravelerDayHotelMap(itinDayIds, "itinerary");
      for (const tripDay of tripDaysNoHotels) {
        const itinDay = dayNumToItinDay.get(tripDay.dayNumber);
        if (itinDay) {
          const fallback = fallbackHotelMap[itinDay.id];
          if (fallback && fallback.length > 0) hotelMap[tripDay.id] = fallback;
        }
      }
    }
  }

  // 2. Activity time fallback: null startTime → use itinerary activity's startTime
  const hasNullTime = tripDays.some(d =>
    (activityMap[d.id] ?? []).some(a => a.startTime === null && a.activityId !== null),
  );
  if (!hasNullTime) return;

  const allItinDayIds = tripDays
    .map(d => dayNumToItinDay.get(d.dayNumber)?.id)
    .filter((id): id is number => id !== undefined);
  if (allItinDayIds.length === 0) return;

  const itinActivities = await db
    .select({ dayId: itineraryDayActivitiesTable.dayId, activityId: itineraryDayActivitiesTable.activityId, startTime: itineraryDayActivitiesTable.startTime })
    .from(itineraryDayActivitiesTable)
    .where(inArray(itineraryDayActivitiesTable.dayId, allItinDayIds));

  const itinTimeMap = new Map<string, string>();
  for (const ia of itinActivities) {
    if (ia.startTime && ia.activityId) itinTimeMap.set(`${ia.dayId}:${ia.activityId}`, ia.startTime);
  }
  if (itinTimeMap.size === 0) return;

  for (const tripDay of tripDays) {
    const itinDay = dayNumToItinDay.get(tripDay.dayNumber);
    if (!itinDay) continue;
    for (const act of activityMap[tripDay.id] ?? []) {
      if (act.startTime === null && act.activityId !== null) {
        const fallback = itinTimeMap.get(`${itinDay.id}:${act.activityId}`);
        if (fallback) act.startTime = fallback;
      }
    }
  }
}

// ─── List trips (agency-invited + own personal trips) ───────────────────────
// Statuses where a shared trip belongs in "Mis viajes" (pre-start / travel companion).
// Ongoing/completed/cancelled shared trips go to "Compartidos" instead.
// Pre-start statuses: shared trips with these statuses appear in "Mis viajes" (travel companion).
// active/finished/cancelled trips stay in "Compartidos" (reference/inspiration context).
const SHARED_MINE_STATUSES = ["draft", "scheduled"] as const;

router.get("/me/trips", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  // 1. Agency trips via accepted invitations
  const invites = await db
    .select({ tripId: invitationsTable.tripId })
    .from(invitationsTable)
    .where(and(eq(invitationsTable.travelerId, userId), eq(invitationsTable.status, "accepted")));

  const invitedIds = invites.map(i => i.tripId).filter((id): id is number => id !== null);

  // 2. Personal trips (ownerId = userId)
  const personalRows = await db
    .select({
      id: tripsTable.id,
      name: tripsTable.name,
      status: tripsTable.status,
      startDate: tripsTable.startDate,
      endDate: tripsTable.endDate,
      createdAt: tripsTable.createdAt,
    })
    .from(tripsTable)
    .where(eq(tripsTable.ownerId, userId));

  // 3. Accepted shares where the trip hasn't started yet → appear here, not in "Compartidos"
  const [meRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = meRow?.email ?? "";

  const sharedMineRows = await db
    .select({
      id: tripsTable.id,
      name: tripsTable.name,
      status: tripsTable.status,
      startDate: tripsTable.startDate,
      endDate: tripsTable.endDate,
      agencyName: agenciesTable.name,
      agencyLogoUrl: agenciesTable.logoUrl,
      countries: itinerariesTable.countries,
      ownerId: tripsTable.ownerId,
      createdAt: tripsTable.createdAt,
    })
    .from(tripSharesTable)
    .innerJoin(tripsTable, and(
      eq(tripsTable.id, tripSharesTable.tripId),
      inArray(tripsTable.status, [...SHARED_MINE_STATUSES]),
    ))
    .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
    .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
    .where(and(
      or(
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.sharedWithEmail, myEmail),
      ),
      eq(tripSharesTable.status, "accepted"),
    ));

  const trips = [];

  // Add invited agency trips
  for (const tripId of invitedIds) {
    const [row] = await db
      .select({
        id: tripsTable.id,
        name: tripsTable.name,
        status: tripsTable.status,
        startDate: tripsTable.startDate,
        endDate: tripsTable.endDate,
        agencyName: agenciesTable.name,
        agencyLogoUrl: agenciesTable.logoUrl,
        countries: itinerariesTable.countries,
        createdAt: tripsTable.createdAt,
      })
      .from(tripsTable)
      .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
      .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
      .where(eq(tripsTable.id, tripId));
    if (row) trips.push({
      ...row,
      isPersonal: false,
      ownerId: null,
      countries: row.countries ?? [],
      agencyName: row.agencyName ?? null,
      agencyLogoUrl: row.agencyLogoUrl ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }

  // Add personal trips (owned)
  for (const row of personalRows) {
    trips.push({
      ...row,
      isPersonal: true,
      ownerId: userId,
      agencyName: null,
      agencyLogoUrl: null,
      countries: [],
      createdAt: row.createdAt.toISOString(),
    });
  }

  // Add shared trips that are pre-start (travel companion context)
  const seenIds = new Set(trips.map(t => t.id));
  for (const row of sharedMineRows) {
    if (seenIds.has(row.id)) continue; // avoid duplicates with owned trips
    trips.push({
      ...row,
      isPersonal: row.ownerId != null && row.agencyName == null,
      countries: row.countries ?? [],
      agencyName: row.agencyName ?? null,
      agencyLogoUrl: row.agencyLogoUrl ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }

  // Sort by startDate desc
  trips.sort((a, b) => a.startDate < b.startDate ? 1 : -1);

  res.json(trips);
});

// ─── Create personal trip ────────────────────────────────────────────────────
router.post("/me/trips", requireRoles("traveler"), validate(PersonalTripInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const {
    name, startDate, endDate,
    itineraryId, maxCapacity,
    airline, flightNumber, flightTime, reservationCode,
    returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode,
    outboundFlights, returnFlights,
  } = req.body;

  const [trip] = await db
    .insert(tripsTable)
    .values({
      name: name.trim(),
      startDate,
      endDate: endDate ?? null,
      ownerId: userId,
      status: "draft",
      ...(itineraryId ? { itineraryId } : {}),
      ...(maxCapacity ? { maxCapacity } : {}),
      ...(airline ? { airline } : {}),
      ...(flightNumber ? { flightNumber } : {}),
      ...(flightTime ? { flightTime } : {}),
      ...(reservationCode ? { reservationCode } : {}),
      ...(returnAirline ? { returnAirline } : {}),
      ...(returnFlightNumber ? { returnFlightNumber } : {}),
      ...(returnFlightTime ? { returnFlightTime } : {}),
      ...(returnReservationCode ? { returnReservationCode } : {}),
      outboundFlights: outboundFlights ?? null,
      returnFlights: returnFlights ?? null,
    })
    .returning();

  // Copy itinerary_days → trip_days (with activities and hotels) at creation time
  if (itineraryId) {
    await copyItineraryDaysToTrip(trip.id, Number(itineraryId), userId);
  }

  res.status(201).json({
    id: trip.id,
    name: trip.name,
    status: trip.status,
    startDate: trip.startDate,
    endDate: trip.endDate ?? null,
    isPersonal: true,
    agencyName: null,
    agencyLogoUrl: null,
    countries: [],
    createdAt: trip.createdAt.toISOString(),
  });
});

// ─── Get trip detail ─────────────────────────────────────────────────────────
router.get("/me/trips/:tripId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  // Access allowed if: invited traveler OR trip owner OR accepted share
  const [invite] = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(and(
      eq(invitationsTable.travelerId, userId),
      eq(invitationsTable.tripId, tripId),
      eq(invitationsTable.status, "accepted"),
    ));

  const [ownedTrip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));

  const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = me?.email ?? "";

  const [acceptedShare] = await db
    .select({ id: tripSharesTable.id, permission: tripSharesTable.permission })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      or(
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.sharedWithEmail, myEmail),
      ),
      eq(tripSharesTable.status, "accepted"),
    ));

  if (!invite && !ownedTrip && !acceptedShare) { res.status(404).json({ error: "Not found" }); return; }

  const myPermission: string | null = acceptedShare ? acceptedShare.permission : null;

  const [row] = await db
    .select({
      id: tripsTable.id,
      name: tripsTable.name,
      status: tripsTable.status,
      startDate: tripsTable.startDate,
      endDate: tripsTable.endDate,
      airline: tripsTable.airline,
      flightNumber: tripsTable.flightNumber,
      flightTime: tripsTable.flightTime,
      reservationCode: tripsTable.reservationCode,
      flightNotes: tripsTable.flightNotes,
      returnAirline: tripsTable.returnAirline,
      returnFlightNumber: tripsTable.returnFlightNumber,
      returnFlightTime: tripsTable.returnFlightTime,
      returnReservationCode: tripsTable.returnReservationCode,
      outboundFlights: tripsTable.outboundFlights,
      returnFlights: tripsTable.returnFlights,
      description: tripsTable.description,
      agencyName: agenciesTable.name,
      agencyLogoUrl: agenciesTable.logoUrl,
      ownerId: tripsTable.ownerId,
      itineraryId: tripsTable.itineraryId,
      createdAt: tripsTable.createdAt,
    })
    .from(tripsTable)
    .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
    .where(eq(tripsTable.id, tripId));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const tripDayRows = await db
    .select()
    .from(tripDaysTable)
    .where(eq(tripDaysTable.tripId, tripId))
    .orderBy(tripDaysTable.dayNumber);

  const acceptedInvitations = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(and(eq(invitationsTable.tripId, tripId), eq(invitationsTable.status, "accepted")));
  const travelerCount = acceptedInvitations.length;

  const currentUserId = req.session.userId!;
  let days: Array<Record<string, unknown>> = [];
  let effectiveTripDays = tripDayRows;

  if (tripDayRows.length > 0) {
    const [hotelMap, activityMap] = await Promise.all([
      getTravelerDayHotelMap(tripDayRows.map(d => d.id), "trip"),
      getTripDayActivityMap(tripDayRows.map(d => d.id), currentUserId),
    ]);
    await mergeItineraryFallbacks(row.itineraryId, tripDayRows, hotelMap, activityMap);
    days = tripDayRows.map(d => ({ ...d, hotels: hotelMap[d.id] ?? [], activities: activityMap[d.id] ?? [] }));
  } else if (row.itineraryId) {
    // Lazy-migrate: copy itinerary_days → trip_days (with activities + hotels)
    // so that activity queries via GET /api/trips/:id/days/:dayId/activities work correctly
    effectiveTripDays = await copyItineraryDaysToTrip(tripId, row.itineraryId, currentUserId);
    if (effectiveTripDays.length > 0) {
      const [hotelMap, activityMap] = await Promise.all([
        getTravelerDayHotelMap(effectiveTripDays.map(d => d.id), "trip"),
        getTripDayActivityMap(effectiveTripDays.map(d => d.id), currentUserId),
      ]);
      await mergeItineraryFallbacks(row.itineraryId, effectiveTripDays, hotelMap, activityMap);
      days = effectiveTripDays.map(d => ({ ...d, hotels: hotelMap[d.id] ?? [], activities: activityMap[d.id] ?? [] }));
    }
  }

  res.json({
    ...row,
    isPersonal: row.ownerId != null && row.agencyName == null,
    myPermission,
    agencyName: row.agencyName ?? null,
    agencyLogoUrl: row.agencyLogoUrl ?? null,
    travelerCount,
    createdAt: row.createdAt.toISOString(),
    daysSource: effectiveTripDays.length > 0 ? "trip" : "itinerary",
    days: days.map(d => ({ ...d, createdAt: (d.createdAt as Date).toISOString() })),
  });
});

// ─── Update personal trip ─────────────────────────────────────────────────────
router.patch("/me/trips/:tripId", requireRoles("traveler"), validate(PersonalTripUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  // Allow owner OR full-permission share user
  const hasEditAccess = await getTripEditAccess(tripId, userId);
  if (hasEditAccess === false) { res.status(403).json({ error: "No tienes permisos para editar este viaje" }); return; }

  const {
    name, status, startDate, endDate,
    airline, flightNumber, flightTime, reservationCode,
    returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode,
    outboundFlights, returnFlights,
  } = req.body;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (status !== undefined) updateData.status = status;
  if (startDate !== undefined) updateData.startDate = startDate;
  if (endDate !== undefined) updateData.endDate = endDate;
  if (airline !== undefined) updateData.airline = airline;
  if (flightNumber !== undefined) updateData.flightNumber = flightNumber;
  if (flightTime !== undefined) updateData.flightTime = flightTime;
  if (reservationCode !== undefined) updateData.reservationCode = reservationCode;
  if (returnAirline !== undefined) updateData.returnAirline = returnAirline;
  if (returnFlightNumber !== undefined) updateData.returnFlightNumber = returnFlightNumber;
  if (returnFlightTime !== undefined) updateData.returnFlightTime = returnFlightTime;
  if (returnReservationCode !== undefined) updateData.returnReservationCode = returnReservationCode;
  if (outboundFlights !== undefined) updateData.outboundFlights = outboundFlights;
  if (returnFlights !== undefined) updateData.returnFlights = returnFlights;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No hay campos para actualizar" }); return;
  }

  await db.update(tripsTable).set(updateData).where(eq(tripsTable.id, tripId));

  // Return updated detail
  const [updated] = await db
    .select({
      id: tripsTable.id,
      name: tripsTable.name,
      status: tripsTable.status,
      startDate: tripsTable.startDate,
      endDate: tripsTable.endDate,
      airline: tripsTable.airline,
      flightNumber: tripsTable.flightNumber,
      flightTime: tripsTable.flightTime,
      reservationCode: tripsTable.reservationCode,
      flightNotes: tripsTable.flightNotes,
      agencyName: agenciesTable.name,
      agencyLogoUrl: agenciesTable.logoUrl,
      ownerId: tripsTable.ownerId,
      itineraryId: tripsTable.itineraryId,
      createdAt: tripsTable.createdAt,
    })
    .from(tripsTable)
    .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
    .where(eq(tripsTable.id, tripId));

  const updatedTripDayRows = await db
    .select()
    .from(tripDaysTable)
    .where(eq(tripDaysTable.tripId, tripId))
    .orderBy(tripDaysTable.dayNumber);

  let updatedDays: Array<{ id: number; tripId: number; dayNumber: number; cityFrom: string | null; cityTo: string | null; transport: string | null; description: string | null; createdAt: Date; hotels: ReturnType<typeof serializeDayHotel>[] }> = [];

  if (updatedTripDayRows.length > 0) {
    const hotelMap = await getTravelerDayHotelMap(updatedTripDayRows.map(d => d.id), "trip");
    updatedDays = updatedTripDayRows.map(d => ({ ...d, hotels: hotelMap[d.id] ?? [] }));
  } else if (updated.itineraryId) {
    const itinDays = await db
      .select()
      .from(itineraryDaysTable)
      .where(eq(itineraryDaysTable.itineraryId, updated.itineraryId))
      .orderBy(itineraryDaysTable.dayNumber);
    const hotelMap = await getTravelerDayHotelMap(itinDays.map(d => d.id), "itinerary");
    updatedDays = itinDays.map(d => ({ ...d, tripId, hotels: hotelMap[d.id] ?? [] }));
  }

  res.json({
    ...updated,
    isPersonal: updated.ownerId != null && updated.agencyName == null,
    agencyName: updated.agencyName ?? null,
    agencyLogoUrl: updated.agencyLogoUrl ?? null,
    createdAt: updated.createdAt.toISOString(),
    days: updatedDays.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })),
  });
});

// ─── Notes ───────────────────────────────────────────────────────────────────
router.get("/me/trips/:tripId/notes", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const notes = await db
    .select()
    .from(tripNotesTable)
    .where(and(eq(tripNotesTable.tripId, tripId), eq(tripNotesTable.userId, userId)))
    .orderBy(tripNotesTable.dayNumber);
  res.json(notes.map(n => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() })));
});

router.post("/me/trips/:tripId/notes", requireRoles("traveler"), validate(TripNoteInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { content, dayNumber } = req.body;
  const [note] = await db
    .insert(tripNotesTable)
    .values({ tripId, userId, content, dayNumber })
    .returning();
  res.status(201).json({ ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() });
});

router.patch("/me/trips/:tripId/notes/:noteId", requireRoles("traveler"), validate(TripNoteUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { content } = req.body;
  const [note] = await db
    .update(tripNotesTable)
    .set({ content })
    .where(and(eq(tripNotesTable.id, noteId), eq(tripNotesTable.userId, userId)))
    .returning();
  if (!note) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() });
});

router.delete("/me/trips/:tripId/notes/:noteId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  await db
    .delete(tripNotesTable)
    .where(and(eq(tripNotesTable.id, noteId), eq(tripNotesTable.userId, userId)));
  res.sendStatus(204);
});

// ─── Helper: verify the requesting user is the trip owner OR has full permission ─
async function canManageShares(tripId: number, userId: number): Promise<boolean> {
  const [owned] = await db.select({ id: tripsTable.id }).from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  if (owned) return true;

  const [fullShare] = await db
    .select({ id: tripSharesTable.id })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      eq(tripSharesTable.sharedWithUserId, userId),
      eq(tripSharesTable.status, "accepted"),
      eq(tripSharesTable.permission, "full"),
    ));
  return !!fullShare;
}

// ─── List shares for a trip I own or manage ───────────────────────────────────
router.get("/me/trips/:tripId/shares", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  const shares = await db.select().from(tripSharesTable).where(eq(tripSharesTable.tripId, tripId));
  res.json(shares.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

// ─── Share a trip ─────────────────────────────────────────────────────────────
router.post("/me/trips/:tripId/shares", requireRoles("traveler"), validate(ShareTripInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { email, permission = "read" } = req.body;

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  // Avoid duplicate pending shares to same email
  const [existing] = await db.select({ id: tripSharesTable.id }).from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      eq(tripSharesTable.sharedWithEmail, email.toLowerCase()),
      eq(tripSharesTable.status, "pending"),
    ));
  if (existing) { res.status(400).json({ error: "Ya hay una invitación pendiente para este email" }); return; }

  // Look up recipient user if already registered
  const [recipient] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  let shareCode: string;
  let attempts = 0;
  do {
    shareCode = makeShareCode();
    attempts++;
  } while (attempts < 5);

  const [share] = await db.insert(tripSharesTable).values({
    tripId,
    ownerId: userId,
    sharedWithEmail: email.toLowerCase(),
    sharedWithUserId: recipient?.id ?? null,
    shareCode,
    permission: permission === "full" ? "full" : "read",
    status: "pending",
  }).returning();

  res.status(201).json({ ...share, createdAt: share.createdAt.toISOString() });
});

// ─── Update share permission ──────────────────────────────────────────────────
router.patch("/me/trips/:tripId/shares/:shareId", requireRoles("traveler"), validate(UpdateShareInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const shareId = parseInt(Array.isArray(req.params.shareId) ? req.params.shareId[0] : req.params.shareId, 10);

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  const { permission } = req.body;

  const [updated] = await db
    .update(tripSharesTable)
    .set({ permission })
    .where(and(eq(tripSharesTable.id, shareId), eq(tripSharesTable.tripId, tripId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Share not found" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// ─── Revoke a share ───────────────────────────────────────────────────────────
router.delete("/me/trips/:tripId/shares/:shareId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const shareId = parseInt(Array.isArray(req.params.shareId) ? req.params.shareId[0] : req.params.shareId, 10);

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  await db.delete(tripSharesTable).where(and(eq(tripSharesTable.id, shareId), eq(tripSharesTable.tripId, tripId)));
  res.sendStatus(204);
});

// ─── List trips shared WITH me ────────────────────────────────────────────────
router.get("/me/shared-trips", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const me = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = me[0]?.email;

  const emailFilter = or(
    eq(tripSharesTable.sharedWithUserId, userId),
    eq(tripSharesTable.sharedWithEmail, myEmail ?? ""),
  );

  const shares = await db.select().from(tripSharesTable).where(emailFilter);

  const result = [];
  for (const share of shares) {
    const [row] = await db
      .select({
        id: tripsTable.id,
        name: tripsTable.name,
        status: tripsTable.status,
        startDate: tripsTable.startDate,
        endDate: tripsTable.endDate,
        agencyName: agenciesTable.name,
        agencyLogoUrl: agenciesTable.logoUrl,
        countries: itinerariesTable.countries,
        ownerId: tripsTable.ownerId,
        createdAt: tripsTable.createdAt,
      })
      .from(tripsTable)
      .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
      .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
      .where(eq(tripsTable.id, share.tripId));

    if (!row) continue;

    // Pending shares always appear here (user needs to accept them).
    // Accepted shares only appear here when the trip is already started/done;
    // pre-start trips (draft/upcoming/scheduled) are shown in "Mis viajes" instead.
    const isAccepted = share.status === "accepted";
    const tripIsPreStart = (SHARED_MINE_STATUSES as readonly string[]).includes(row.status ?? "");
    if (isAccepted && tripIsPreStart) continue;

    result.push({
      shareId: share.id,
      shareCode: share.shareCode,
      permission: share.permission,
      status: share.status,
      createdAt: share.createdAt.toISOString(),
      trip: {
        id: row.id,
        name: row.name,
        status: row.status,
        startDate: row.startDate,
        endDate: row.endDate ?? null,
        isPersonal: row.ownerId != null && row.agencyName == null,
        agencyName: row.agencyName ?? null,
        agencyLogoUrl: row.agencyLogoUrl ?? null,
        countries: row.countries ?? [],
        createdAt: row.createdAt.toISOString(),
      },
    });
  }

  res.json(result);
});

// ─── Accept a share by code ───────────────────────────────────────────────────
// ─── Trip Day management (personal trips) ────────────────────────────────────

/**
 * Returns the itineraryId for a trip if the user has edit access
 * (owner OR accepted share with permission='full').
 * Returns false if the user has no edit access.
 */
async function getTripEditAccess(tripId: number, userId: number): Promise<number | null | false> {
  // Check owner first
  const [trip] = await db
    .select({ id: tripsTable.id, itineraryId: tripsTable.itineraryId })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));

  if (trip) {
    if (trip.itineraryId) return trip.itineraryId;
    // Auto-create itinerary if none exists
    const [itin] = await db
      .insert(itinerariesTable)
      .values({ name: "Mi itinerario", numDays: 0 })
      .returning();
    await db.update(tripsTable).set({ itineraryId: itin.id }).where(eq(tripsTable.id, tripId));
    return itin.id;
  }

  // Check full-permission share (match by userId OR email to handle edge cases where sharedWithUserId is null)
  const [userRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const userEmail = userRow?.email ?? "";

  const [fullShare] = await db
    .select({ id: tripSharesTable.id })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      or(
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.sharedWithEmail, userEmail),
      ),
      eq(tripSharesTable.status, "accepted"),
      eq(tripSharesTable.permission, "full"),
    ));
  if (!fullShare) return false;

  // Fetch the trip's itineraryId (shared user can't auto-create itinerary)
  const [sharedTrip] = await db
    .select({ itineraryId: tripsTable.itineraryId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  return sharedTrip ? (sharedTrip.itineraryId ?? null) : false;
}

router.post("/me/trips/:tripId/days", requireRoles("traveler"), validate(PersonalTripDayInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const itineraryId = await getTripEditAccess(tripId, userId);
  if (itineraryId === false) { res.status(403).json({ error: "No tienes permisos para editar este viaje" }); return; }

  const { dayNumber, cityFrom, cityTo, country, transport, description } = req.body;

  const [day] = await db
    .insert(itineraryDaysTable)
    .values({
      itineraryId: itineraryId as number,
      dayNumber,
      ...(cityFrom ? { cityFrom } : {}),
      ...(cityTo ? { cityTo } : {}),
      ...(country ? { country } : {}),
      ...(transport ? { transport } : {}),
      ...(description ? { description } : {}),
    })
    .returning();

  res.status(201).json({
    id: day.id,
    tripId,
    dayNumber: day.dayNumber,
    cityFrom: day.cityFrom ?? null,
    cityTo: day.cityTo ?? null,
    country: day.country ?? null,
    transport: day.transport ?? null,
    description: day.description ?? null,
    hotels: [],
    createdAt: day.createdAt.toISOString(),
  });
});

router.patch("/me/trips/:tripId/days/:dayId", requireRoles("traveler"), validate(PersonalTripDayUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);

  const itineraryId = await getTripEditAccess(tripId, userId);
  if (itineraryId === false) { res.status(403).json({ error: "No tienes permisos para editar este viaje" }); return; }

  const { dayNumber, cityFrom, cityTo, country, transport, description } = req.body;

  const patch: Record<string, unknown> = {};
  if (dayNumber !== undefined) patch.dayNumber = dayNumber;
  if (cityFrom !== undefined) patch.cityFrom = cityFrom ?? null;
  if (cityTo !== undefined) patch.cityTo = cityTo ?? null;
  if (country !== undefined) patch.country = country ?? null;
  if (transport !== undefined) patch.transport = transport ?? null;
  if (description !== undefined) patch.description = description ?? null;

  const [updated] = await db
    .update(itineraryDaysTable)
    .set(patch)
    .where(and(eq(itineraryDaysTable.id, dayId), eq(itineraryDaysTable.itineraryId, itineraryId as number)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Día no encontrado" }); return; }

  res.json({
    id: updated.id,
    tripId,
    dayNumber: updated.dayNumber,
    cityFrom: updated.cityFrom ?? null,
    cityTo: updated.cityTo ?? null,
    country: updated.country ?? null,
    transport: updated.transport ?? null,
    description: updated.description ?? null,
    hotels: [],
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/me/trips/:tripId/days/:dayId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);

  const itineraryId = await getTripEditAccess(tripId, userId);
  if (itineraryId === false) { res.status(403).json({ error: "No tienes permisos para editar este viaje" }); return; }

  await db.delete(itineraryDaysTable)
    .where(and(eq(itineraryDaysTable.id, dayId), eq(itineraryDaysTable.itineraryId, itineraryId as number)));

  res.sendStatus(204);
});

// ─── Leave a trip (remove own invitation or share) ───────────────────────────
router.delete("/me/trips/:tripId/leave", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const [meRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = meRow?.email ?? "";

  // Remove accepted invitation
  await db.delete(invitationsTable).where(and(
    eq(invitationsTable.tripId, tripId),
    eq(invitationsTable.travelerId, userId),
    eq(invitationsTable.status, "accepted"),
  ));

  // Remove accepted share
  await db.delete(tripSharesTable).where(and(
    eq(tripSharesTable.tripId, tripId),
    or(
      eq(tripSharesTable.sharedWithUserId, userId),
      eq(tripSharesTable.sharedWithEmail, myEmail),
    ),
    eq(tripSharesTable.status, "accepted"),
  ));

  res.sendStatus(204);
});

// ─── Dismiss a cancelled trip from the traveler's view ───────────────────────
router.delete("/me/trips/:tripId/dismiss", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const [meRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = meRow?.email ?? "";

  // Remove invitation (any status)
  await db.delete(invitationsTable).where(and(
    eq(invitationsTable.tripId, tripId),
    eq(invitationsTable.travelerId, userId),
  ));

  // Remove share (any status)
  await db.delete(tripSharesTable).where(and(
    eq(tripSharesTable.tripId, tripId),
    or(
      eq(tripSharesTable.sharedWithUserId, userId),
      eq(tripSharesTable.sharedWithEmail, myEmail),
    ),
  ));

  res.sendStatus(204);
});

router.post("/me/shares/:shareCode/accept", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const shareCode = Array.isArray(req.params.shareCode) ? req.params.shareCode[0] : req.params.shareCode;

  const [share] = await db.select().from(tripSharesTable)
    .where(eq(tripSharesTable.shareCode, shareCode));

  if (!share) { res.status(404).json({ error: "Código no encontrado" }); return; }
  if (share.status !== "pending") { res.status(400).json({ error: "Este código ya fue usado" }); return; }

  const [updated] = await db.update(tripSharesTable)
    .set({ status: "accepted", sharedWithUserId: userId })
    .where(eq(tripSharesTable.id, share.id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// ─── Trip Documents ───────────────────────────────────────────────────────────
router.get("/me/trips/:tripId/documents", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  // Verify the user has access to this trip before listing documents
  const [invite] = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(and(
      eq(invitationsTable.travelerId, userId),
      eq(invitationsTable.tripId, tripId),
      eq(invitationsTable.status, "accepted"),
    ));

  const [ownedTrip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));

  const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = me?.email ?? "";

  const [acceptedShare] = await db
    .select({ id: tripSharesTable.id })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      or(
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.sharedWithEmail, myEmail),
      ),
      eq(tripSharesTable.status, "accepted"),
    ));

  if (!invite && !ownedTrip && !acceptedShare) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Return all documents for the trip (own uploads + agency-uploaded docs)
  const docs = await db
    .select({
      id: tripDocumentsTable.id,
      tripId: tripDocumentsTable.tripId,
      userId: tripDocumentsTable.userId,
      filename: tripDocumentsTable.filename,
      mimeType: tripDocumentsTable.mimeType,
      storageKey: tripDocumentsTable.storageKey,
      createdAt: tripDocumentsTable.createdAt,
      uploaderRole: usersTable.role,
    })
    .from(tripDocumentsTable)
    .leftJoin(usersTable, eq(usersTable.id, tripDocumentsTable.userId))
    .where(eq(tripDocumentsTable.tripId, tripId))
    .orderBy(tripDocumentsTable.createdAt);
  res.json(docs.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), uploaderRole: d.uploaderRole ?? "traveler" })));
});

router.post("/me/trips/:tripId/documents", requireRoles("traveler"), validate(TripDocumentInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  // Ensure the user actually has access to this trip (owner or accepted share)
  const [tripAccess] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .leftJoin(
      tripSharesTable,
      and(
        eq(tripSharesTable.tripId, tripsTable.id),
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.status, "accepted"),
      ),
    )
    .where(
      and(
        eq(tripsTable.id, tripId),
        or(
          eq(tripsTable.ownerId, userId),
          eq(tripSharesTable.sharedWithUserId, userId),
        ),
      ),
    );

  if (!tripAccess) { res.status(403).json({ error: "Forbidden" }); return; }

  const { filename, mimeType, storageKey } = req.body;

  // Validate storageKey is within the private objects namespace
  if (!storageKey.startsWith("/objects/")) {
    res.status(400).json({ error: "Invalid storage key" });
    return;
  }

  const [doc] = await db
    .insert(tripDocumentsTable)
    .values({ tripId, userId, filename, mimeType, storageKey })
    .returning();
  res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString(), uploaderRole: "traveler" });
});

router.delete("/me/trips/:tripId/documents/:documentId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);

  const [doc] = await db
    .select()
    .from(tripDocumentsTable)
    .where(and(eq(tripDocumentsTable.id, documentId), eq(tripDocumentsTable.userId, userId)));

  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  try {
    const file = await objectStorage.getObjectEntityFile(doc.storageKey);
    await file.delete();
  } catch (_) {
    // Best-effort delete from storage; continue regardless
  }

  await db.delete(tripDocumentsTable).where(eq(tripDocumentsTable.id, documentId));
  res.sendStatus(204);
});

// ─── Get signed download URL for a trip document ─────────────────────────────
router.get("/me/trips/:tripId/documents/:documentId/download", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);

  // Find the document for this trip
  const [doc] = await db
    .select()
    .from(tripDocumentsTable)
    .where(and(eq(tripDocumentsTable.id, documentId), eq(tripDocumentsTable.tripId, tripId)));

  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  // Authorization: the user must either have uploaded the doc, or have trip access
  const isUploader = doc.userId === userId;

  if (!isUploader) {
    // Check trip access: invited traveler, owner, or accepted share
    const [invite] = await db
      .select({ id: invitationsTable.id })
      .from(invitationsTable)
      .where(and(
        eq(invitationsTable.travelerId, userId),
        eq(invitationsTable.tripId, tripId),
        eq(invitationsTable.status, "accepted"),
      ));

    const [ownedTrip] = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));

    const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    const myEmail = me?.email ?? "";

    const [acceptedShare] = await db
      .select({ id: tripSharesTable.id })
      .from(tripSharesTable)
      .where(and(
        eq(tripSharesTable.tripId, tripId),
        or(
          eq(tripSharesTable.sharedWithUserId, userId),
          eq(tripSharesTable.sharedWithEmail, myEmail),
        ),
        eq(tripSharesTable.status, "accepted"),
      ));

    if (!invite && !ownedTrip && !acceptedShare) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  try {
    const signedUrl = await objectStorage.getSignedDownloadUrl(doc.storageKey, 900);
    res.json({ signedUrl });
  } catch (err) {
    req.log.error({ err }, "Error generating signed download URL");
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

export default router;
