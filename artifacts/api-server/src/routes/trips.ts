import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable, tripDaysTable, tripDayHotelsTable, tripDayActivitiesTable,
  itinerariesTable, itineraryDaysTable, itineraryDayHotelsTable, itineraryDayActivitiesTable,
  hotelsTable, invitationsTable, agenciesTable, tripSharesTable, activitiesTable,
  usersTable, tripDocumentsTable, countryAdvisoriesTable, tripDayActivityParticipantsTable,
  tripNotesTable, tripLinksTable,
} from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import {
  TripInputSchema, TripUpdateSchema, TripDayUpdateSchema,
  DayHotelInputSchema, DayActivityInputSchema, TripDayActivityUpdateSchema,
  TripDocumentInputSchema, TripDocumentRenameSchema, PersonalTripDayInputSchema,
  TripNoteInputSchema, TripNoteUpdateSchema, TripLinkInputSchema,
} from "../lib/schemas";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendDocumentUploadedEmail, sendTripUpdatedEmail } from "../lib/email";
import { getTripCountries, ensureCountryAdvisoryFresh } from "../lib/travel-advisory-refresh";
import { buildAdvisoryUrl } from "../lib/travel-advisory-scraper";
import { geocodeCity } from "../lib/geocoding";
import { PUBLIC_APP_URL } from "../lib/publicUrl";
import { closeDayGap, repositionDay, shiftTripNotesForDayRemoval, shiftTripNotesForReposition } from "../lib/day-renumbering";
import { sanitizeNoteHtml } from "../lib/sanitize";

const objectStorage = new ObjectStorageService();

const router: IRouter = Router();

// Fire-and-forget notification to every traveler who has accepted an invitation to this
// trip, whenever agency staff (not a traveler self-editing their own personal trip) changes
// dates, hotels, or activities. No-op for trips without an agency (personal trips).
async function notifyTripUpdated(tripId: number, changeDescription: string, onError: (err: unknown) => void): Promise<void> {
  try {
    const [tripRow] = await db
      .select({ name: tripsTable.name, agencyId: tripsTable.agencyId })
      .from(tripsTable)
      .where(eq(tripsTable.id, tripId));
    if (!tripRow || !tripRow.agencyId) return;

    const [agency] = await db
      .select({ name: agenciesTable.name })
      .from(agenciesTable)
      .where(eq(agenciesTable.id, tripRow.agencyId));
    if (!agency) return;

    const accepted = await db
      .select({ email: invitationsTable.email, name: usersTable.name })
      .from(invitationsTable)
      .leftJoin(usersTable, eq(usersTable.id, invitationsTable.travelerId))
      .where(and(eq(invitationsTable.tripId, tripId), eq(invitationsTable.status, "accepted")));

    // Wouter uses plain paths, not hash-routing, and this goes to travelers (not back-office
    // staff) — /trips/:id is the agency route and would be blocked by role, and "/#/" resolves
    // to a blank page regardless (see TESTING.md, 2026-07-30).
    const tripUrl = `${PUBLIC_APP_URL}/traveler/trips/${tripId}`;

    await Promise.allSettled(
      accepted.map(t => sendTripUpdatedEmail({
        to: t.email,
        name: t.name ?? "viajero",
        tripName: tripRow.name,
        agencyName: agency.name,
        changeDescription,
        tripUrl,
        tripId,
      })),
    );
  } catch (err) {
    onError(err);
  }
}

export interface TripDayAccessResult {
  authorized: boolean;
  reason: string;
  trip?: { agencyId: number | null; ownerId: number | null };
  // How a traveler's access was granted, when relevant to finer-grained permission checks
  // downstream (e.g. can this traveler create a por-libre activity?). "member"/"guest" only
  // when access came via an accepted trip_shares row; null for owner/staff/agency-invitation
  // access, which is never guest-restricted.
  memberType?: "member" | "guest" | null;
}

/**
 * Verify a user is authorized to access the given trip (no day involved). Shared by
 * verifyTripDayAccess (after it confirms dayId belongs to tripId) and by trip-level-only
 * endpoints like GET /trips/:tripId/members.
 */
export async function verifyTripAccessCore(
  tripId: number,
  userId: number,
  agencyId: number | null | undefined,
  role: string | undefined,
): Promise<TripDayAccessResult> {
  const [trip] = await db
    .select({ id: tripsTable.id, agencyId: tripsTable.agencyId, ownerId: tripsTable.ownerId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  if (!trip) return { authorized: false, reason: "Trip not found" };

  const tripInfo = { agencyId: trip.agencyId, ownerId: trip.ownerId };

  // Super-admin
  if (role === "admin") return { authorized: true, reason: "", trip: tripInfo, memberType: null };

  // Agency staff: trip must belong to their agency
  if ((role === "manager" || role === "agent") && agencyId != null && trip.agencyId === agencyId) {
    return { authorized: true, reason: "", trip: tripInfo, memberType: null };
  }

  // Traveler: trip owner OR accepted invitation OR accepted share
  if (role === "traveler") {
    // Owner of the trip (personal trips created via POST /me/trips)
    if (trip.ownerId === userId) return { authorized: true, reason: "", trip: tripInfo, memberType: null };

    const [inv] = await db
      .select({ id: invitationsTable.id })
      .from(invitationsTable)
      .where(and(
        eq(invitationsTable.tripId, tripId),
        eq(invitationsTable.travelerId, userId),
        eq(invitationsTable.status, "accepted"),
      ));
    if (inv) return { authorized: true, reason: "", trip: tripInfo, memberType: null };

    const [share] = await db
      .select({ id: tripSharesTable.id, memberType: tripSharesTable.memberType })
      .from(tripSharesTable)
      .where(and(
        eq(tripSharesTable.tripId, tripId),
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.status, "accepted"),
      ));
    if (share) return { authorized: true, reason: "", trip: tripInfo, memberType: share.memberType };
  }

  return { authorized: false, reason: "Not authorized for this trip" };
}

/**
 * Verify a user is authorized to access the given trip+day.
 * Also validates that dayId actually belongs to tripId (IDOR prevention).
 * Returns the trip row on success, or null if unauthorized/not-found.
 */
async function verifyTripDayAccess(
  tripId: number,
  dayId: number,
  userId: number,
  agencyId: number | null | undefined,
  role: string | undefined,
): Promise<TripDayAccessResult> {
  // Verify dayId belongs to tripId
  const [day] = await db
    .select({ id: tripDaysTable.id })
    .from(tripDaysTable)
    .where(and(eq(tripDaysTable.id, dayId), eq(tripDaysTable.tripId, tripId)));
  if (!day) return { authorized: false, reason: "Day not found in this trip" };

  return verifyTripAccessCore(tripId, userId, agencyId, role);
}

function isAgencyStaffRole(role: string | undefined): boolean {
  return role === "admin" || role === "manager" || role === "agent";
}

// "Trip creator": agency staff of the trip's own agency (admin counts for any agency, matching
// its super-admin status elsewhere), or the owner of a personal trip. This is a strictly
// narrower tier than verifyTripDayAccess's broad "can reach this trip day" check -- it
// deliberately excludes accepted invitations and trip_shares (even permission="full"), per the
// #151 decision that a full-permission share does not grant rights over included activities.
function isTripCreator(
  trip: { agencyId: number | null; ownerId: number | null },
  session: { userId: number; role: string | undefined; agencyId: number | null | undefined },
): boolean {
  if (session.role === "admin") return true;
  if ((session.role === "manager" || session.role === "agent") && session.agencyId != null && trip.agencyId === session.agencyId) {
    return true;
  }
  if (session.role === "traveler" && trip.ownerId === session.userId) return true;
  return false;
}

// Edit/delete rights on a single activity link (#151): included activities are managed only by
// the trip's creator; por-libre activities are managed only by whoever created that activity.
function canManageActivity(
  trip: { agencyId: number | null; ownerId: number | null },
  activity: { included: boolean; createdByUserId: number | null },
  session: { userId: number; role: string | undefined; agencyId: number | null | undefined },
): boolean {
  if (activity.included) return isTripCreator(trip, session);
  return activity.createdByUserId === session.userId;
}

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
  hotelAddress: string | null; hotelPhone: string | null; hotelWebsite: string | null;
  segment: string | null; createdAt: Date;
}) {
  return { id: r.id, hotelId: r.hotelId, hotelName: r.hotelName, hotelCity: r.hotelCity, hotelAddress: r.hotelAddress, hotelPhone: r.hotelPhone, hotelWebsite: r.hotelWebsite, segment: r.segment, createdAt: r.createdAt.toISOString() };
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
      hotelAddress: hotelsTable.address,
      hotelPhone: hotelsTable.phone,
      hotelWebsite: hotelsTable.website,
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

/** Build a serialized DayActivity response object */
function serializeDayActivity(r: {
  id: number;
  dayId: number;
  activityId: number | null;
  activityTitle: string | null;
  activityName: string | null;
  activityCategory: string | null;
  sortOrder: number;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  companyContact: string | null;
  addressOverride: string | null;
  included: boolean;
  transportMode: string | null;
  createdByUserId: number | null;
  address: string | null;
  durationHours: number | null;
  createdAt: string;
  canEdit: boolean;
  costAmount?: number | null;
  costCurrency?: string | null;
  createdByName?: string | null;
  participants?: { id: number; name: string }[];
  warning?: string | null;
}) {
  return {
    id: r.id,
    dayId: r.dayId,
    activityId: r.activityId ?? null,
    activityName: r.activityTitle ?? r.activityName ?? "",
    activityCategory: r.activityCategory ?? null,
    sortOrder: r.sortOrder,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    notes: r.notes ?? null,
    companyContact: r.companyContact ?? null,
    addressOverride: r.addressOverride ?? null,
    included: r.included,
    transportMode: r.transportMode ?? null,
    address: r.addressOverride ?? r.address ?? null,
    durationHours: r.durationHours ?? null,
    createdAt: r.createdAt,
    canEdit: r.canEdit,
    costAmount: r.costAmount ?? null,
    costCurrency: r.costCurrency ?? null,
    createdByName: r.createdByName ?? null,
    participants: r.participants ?? [],
    ...(r.warning ? { warning: r.warning } : {}),
  };
}

async function getActivityParticipants(activityLinkId: number): Promise<{ id: number; name: string }[]> {
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(tripDayActivityParticipantsTable)
    .innerJoin(usersTable, eq(usersTable.id, tripDayActivityParticipantsTable.travelerId))
    .where(eq(tripDayActivityParticipantsTable.activityLinkId, activityLinkId));
  return rows;
}

// Every user with accepted access to a trip, as a real traveler ({userId, name}) rather than
// just an email -- needed for the por-libre participant picker (#151). Guests (member_type =
// "guest") are deliberately excluded: they can't be added as participants. Mirrors the
// owner+invitations+shares union already used by GET /trips/:tripId/usage, but resolves identity.
export async function listTripMembers(tripId: number): Promise<{ id: number; name: string }[]> {
  const [trip] = await db.select({ ownerId: tripsTable.ownerId }).from(tripsTable).where(eq(tripsTable.id, tripId));

  const invited = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(invitationsTable)
    .innerJoin(usersTable, eq(usersTable.id, invitationsTable.travelerId))
    .where(and(eq(invitationsTable.tripId, tripId), eq(invitationsTable.status, "accepted")));

  const members = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(tripSharesTable)
    .innerJoin(usersTable, eq(usersTable.id, tripSharesTable.sharedWithUserId))
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      eq(tripSharesTable.status, "accepted"),
      eq(tripSharesTable.memberType, "member"),
    ));

  const owner = trip?.ownerId
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, trip.ownerId))
    : [];

  const seen = new Set<number>();
  const result: { id: number; name: string }[] = [];
  for (const u of [...owner, ...invited, ...members]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    result.push(u);
  }
  return result;
}

// Soft, non-blocking warning (#151): flags when a new/edited time overlaps an included
// activity on the same day. Callers still save the activity regardless of this result.
async function checkTimeCollision(dayId: number, startTime: string | null | undefined, endTime: string | null | undefined, excludeLinkId?: number): Promise<string | null> {
  if (!startTime) return null;
  const effectiveEnd = endTime ?? startTime;

  const rows = await db
    .select({ id: tripDayActivitiesTable.id, startTime: tripDayActivitiesTable.startTime, endTime: tripDayActivitiesTable.endTime })
    .from(tripDayActivitiesTable)
    .where(and(eq(tripDayActivitiesTable.dayId, dayId), eq(tripDayActivitiesTable.included, true)));

  for (const row of rows) {
    if (excludeLinkId != null && row.id === excludeLinkId) continue;
    if (!row.startTime) continue;
    const otherEnd = row.endTime ?? row.startTime;
    if (startTime < otherEnd && row.startTime < effectiveEnd) {
      return "El horario coincide con otra actividad incluida de este día.";
    }
  }
  return null;
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

router.post("/trips", requireRoles("admin", "manager", "agent"), validate(TripInputSchema), async (req, res): Promise<void> => {
  const { name, description, itineraryId, startDate, endDate, maxCapacity, airline, flightNumber, flightTime, reservationCode, flightNotes, returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode, outboundFlights, returnFlights } = req.body;
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
          cityFromCountry: d.cityFromCountry,
          cityToCountry: d.cityToCountry,
          transport: d.transport,
          description: d.description,
          isTransitNight: d.isTransitNight,
          photoUrl: d.photoUrl,
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
        const creatorId = req.session.userId ?? null;
        for (const a of activityCopies) {
          const tripDayId = itinDayToTripDay[a.dayId];
          await db.execute(sql`
            INSERT INTO trip_day_activities (day_id, activity_id, sort_order, notes, start_time, created_by_user_id)
            VALUES (${tripDayId}, ${a.activityId}, ${a.sortOrder}, ${a.notes ?? null}, ${a.startTime ?? null}, ${creatorId})
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

// ─── TRIP DAY CREATE (back-office) ───────────────────────────────────────────
router.post("/trips/:tripId/days", requireRoles("admin", "manager", "agent"), validate(PersonalTripDayInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { dayNumber, cityFrom, cityTo, cityFromCountry, cityToCountry, transport, description, isTransitNight } = req.body;

  const [trip] = await db.select({ id: tripsTable.id }).from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) { res.status(404).json({ error: "Trip not found" }); return; }

  // Geocode eagerly at creation time (per the map feature's design) rather than only lazily when
  // the Mapa tab is opened -- best-effort, a failed lookup just leaves the coords null.
  const [fromGeo, toGeo] = await Promise.all([geocodeCity(cityFrom, cityFromCountry), geocodeCity(cityTo, cityToCountry)]);

  const [day] = await db
    .insert(tripDaysTable)
    .values({
      tripId, dayNumber, cityFrom: cityFrom ?? null, cityTo: cityTo ?? null,
      cityFromCountry: cityFromCountry ?? null, cityToCountry: cityToCountry ?? null,
      transport: transport ?? null, description: description ?? null,
      cityFromLat: fromGeo?.lat ?? null, cityFromLng: fromGeo?.lng ?? null,
      cityToLat: toGeo?.lat ?? null, cityToLng: toGeo?.lng ?? null,
      ...(isTransitNight !== undefined ? { isTransitNight } : {}),
    })
    .returning();

  res.status(201).json({ ...day, hotels: [], activities: [], createdAt: day.createdAt.toISOString() });
});

// ─── TRIP DAY DELETE (back-office) ───────────────────────────────────────────
router.delete("/trips/:tripId/days/:dayId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);

  const [day] = await db
    .select({ id: tripDaysTable.id })
    .from(tripDaysTable)
    .where(and(eq(tripDaysTable.id, dayId), eq(tripDaysTable.tripId, tripId)));
  if (!day) { res.status(404).json({ error: "Day not found" }); return; }

  await db.transaction(async (tx) => {
    const [removed] = await tx.delete(tripDaysTable).where(eq(tripDaysTable.id, dayId)).returning({ dayNumber: tripDaysTable.dayNumber });
    if (removed) {
      await closeDayGap(tx, "trip_days", "trip_id", tripId, removed.dayNumber);
      await shiftTripNotesForDayRemoval(tx, tripId, removed.dayNumber);
    }
  });

  res.sendStatus(204);
});

// ─── TRIP DAY UPDATE (back-office) ───────────────────────────────────────────
router.patch("/trips/:tripId/days/:dayId", requireAuth, validate(TripDayUpdateSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { dayNumber, cityFrom, cityTo, cityFromCountry, cityToCountry, transport, description, isTransitNight, photoUrl } = req.body;
  const patch: Record<string, unknown> = {};
  if (cityFrom !== undefined) patch.cityFrom = cityFrom;
  if (cityTo !== undefined) patch.cityTo = cityTo;
  if (cityFromCountry !== undefined) patch.cityFromCountry = cityFromCountry;
  if (cityToCountry !== undefined) patch.cityToCountry = cityToCountry;
  if (transport !== undefined) patch.transport = transport;
  if (description !== undefined) patch.description = description;
  if (isTransitNight !== undefined) patch.isTransitNight = isTransitNight;
  if (photoUrl !== undefined) patch.photoUrl = photoUrl;

  // Only re-geocode a side that's actually changing in this request.
  if (cityFrom !== undefined) {
    const geo = await geocodeCity(cityFrom, cityFromCountry);
    patch.cityFromLat = geo?.lat ?? null;
    patch.cityFromLng = geo?.lng ?? null;
  }
  if (cityTo !== undefined) {
    const geo = await geocodeCity(cityTo, cityToCountry);
    patch.cityToLat = geo?.lat ?? null;
    patch.cityToLng = geo?.lng ?? null;
  }

  const updated = await db.transaction(async (tx) => {
    if (dayNumber !== undefined) {
      const [current] = await tx.select({ dayNumber: tripDaysTable.dayNumber }).from(tripDaysTable).where(and(eq(tripDaysTable.id, dayId), eq(tripDaysTable.tripId, tripId)));
      if (current && current.dayNumber !== dayNumber) {
        const mapping = await repositionDay(tx, "trip_days", "trip_id", tripId, dayId, current.dayNumber, dayNumber);
        await shiftTripNotesForReposition(tx, tripId, mapping);
      }
    }
    const [row] = Object.keys(patch).length > 0
      ? await tx.update(tripDaysTable).set(patch).where(and(eq(tripDaysTable.id, dayId), eq(tripDaysTable.tripId, tripId))).returning()
      : await tx.select().from(tripDaysTable).where(and(eq(tripDaysTable.id, dayId), eq(tripDaysTable.tripId, tripId)));
    return row;
  });
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

router.post("/trips/:tripId/days/:dayId/hotels", requireAuth, validate(DayHotelInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const currentUserId = req.session.userId!;

  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }

  const { hotelId, segment } = req.body as { hotelId: number; segment: "basic" | "standard" | "premium" };
  if (!hotelId) { res.status(400).json({ error: "hotelId is required" }); return; }

  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, hotelId));
  if (!hotel) { res.status(404).json({ error: "Hotel not found" }); return; }

  const [assignment] = await db
    .insert(tripDayHotelsTable)
    .values({ tripDayId: dayId, hotelId, segment })
    .returning();

  res.status(201).json(serializeDayHotel({ id: assignment.id, hotelId: assignment.hotelId, hotelName: hotel.name, hotelCity: hotel.city ?? null, hotelAddress: hotel.address ?? null, hotelPhone: hotel.phone ?? null, hotelWebsite: hotel.website ?? null, segment: assignment.segment, createdAt: assignment.createdAt }));

  const isAgencyStaff = req.session.role === "admin" || req.session.role === "manager" || req.session.role === "agent";
  if (isAgencyStaff) {
    notifyTripUpdated(
      tripId,
      `<p style="margin:0">Hotel añadido: ${hotel.name}</p>`,
      (err) => req.log.error({ err }, "Failed to send trip updated notifications"),
    );
  }
});

router.delete("/trips/:tripId/days/:dayId/hotels/:assignmentId", requireAuth, async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const assignmentId = parseInt(Array.isArray(req.params.assignmentId) ? req.params.assignmentId[0] : req.params.assignmentId, 10);
  const currentUserId = req.session.userId!;

  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }

  await db.delete(tripDayHotelsTable).where(and(eq(tripDayHotelsTable.id, assignmentId), eq(tripDayHotelsTable.tripDayId, dayId)));
  res.sendStatus(204);

  const isAgencyStaff = req.session.role === "admin" || req.session.role === "manager" || req.session.role === "agent";
  if (isAgencyStaff) {
    notifyTripUpdated(
      tripId,
      `<p style="margin:0">Se ha eliminado un hotel del itinerario.</p>`,
      (err) => req.log.error({ err }, "Failed to send trip updated notifications"),
    );
  }
});

// ─── TRIP DAY ACTIVITIES ─────────────────────────────────────────────────────
router.get("/trips/:tripId/days/:dayId/activities", requireAuth, async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const currentUserId = req.session.userId!;

  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  const trip = access.trip!;

  const rows = await db.execute(sql`
    SELECT
      tda.id, tda.day_id, tda.activity_id, tda.activity_title,
      a.name AS activity_name, a.category AS activity_category,
      tda.sort_order, tda.start_time, tda.end_time, tda.notes,
      tda.company_contact, tda.address_override, tda.included, tda.transport_mode,
      tda.created_by_user_id, tda.cost_amount, tda.cost_currency,
      cb.name AS created_by_name,
      a.address AS activity_address, a.duration_hours AS activity_duration_hours,
      tda.created_at,
      COALESCE((
        SELECT json_agg(json_build_object('id', u.id, 'name', u.name))
        FROM trip_day_activity_participants p
        JOIN users u ON u.id = p.traveler_id
        WHERE p.activity_link_id = tda.id
      ), '[]') AS participants
    FROM trip_day_activities tda
    LEFT JOIN activities a ON a.id = tda.activity_id
    LEFT JOIN users cb ON cb.id = tda.created_by_user_id
    WHERE tda.day_id = ${dayId}
    ORDER BY
      CASE WHEN tda.start_time IS NULL THEN 1 ELSE 0 END,
      tda.start_time ASC,
      tda.sort_order ASC,
      tda.created_at ASC
  `);

  const session = { userId: currentUserId, role: req.session.role, agencyId: req.session.agencyId };

  res.json((rows.rows as Array<Record<string, unknown>>).map(r => {
    const createdByUserId = r.created_by_user_id != null ? Number(r.created_by_user_id) : null;
    const included = Boolean(r.included);
    const canEdit = canManageActivity(trip, { included, createdByUserId }, session);
    return serializeDayActivity({
      id: Number(r.id),
      dayId: Number(r.day_id),
      activityId: r.activity_id != null ? Number(r.activity_id) : null,
      activityTitle: r.activity_title as string | null,
      activityName: r.activity_name as string | null,
      activityCategory: r.activity_category as string | null,
      sortOrder: Number(r.sort_order),
      startTime: r.start_time as string | null,
      endTime: r.end_time as string | null,
      notes: r.notes as string | null,
      companyContact: r.company_contact as string | null,
      addressOverride: r.address_override as string | null,
      included,
      transportMode: r.transport_mode as string | null,
      createdByUserId,
      address: r.activity_address as string | null,
      durationHours: r.activity_duration_hours != null ? parseFloat(r.activity_duration_hours as string) : null,
      createdAt: String(r.created_at),
      canEdit,
      costAmount: r.cost_amount != null ? parseFloat(r.cost_amount as string) : null,
      costCurrency: r.cost_currency as string | null,
      createdByName: r.created_by_name as string | null,
      participants: r.participants as { id: number; name: string }[],
    });
  }));
});

router.post("/trips/:tripId/days/:dayId/activities", requireAuth, validate(DayActivityInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const currentUserId = req.session.userId!;
  const role = req.session.role;

  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  const trip = access.trip!;
  const session = { userId: currentUserId, role, agencyId: req.session.agencyId };

  const {
    activityId,
    activityTitle,
    sortOrder = 0,
    notes,
    startTime,
    endTime,
    companyContact,
    addressOverride,
    included,
    transportMode,
    costAmount,
    participantIds,
  } = req.body;

  // Agency staff must supply an activityId; travelers can create free activities (no activityId)
  const isAgencyStaff = role === "admin" || role === "manager" || role === "agent";

  if (!activityId && !activityTitle) {
    res.status(400).json({ error: "activityId or activityTitle is required" });
    return;
  }

  const isIncluded = included !== undefined ? included : (activityId ? true : false);

  // #151: an included activity may only be created by the trip's creator; a por-libre activity
  // only by an agent or a traveler with member/edit-level access (not a guest-permission share).
  if (isIncluded && !isTripCreator(trip, session)) {
    res.status(403).json({ error: "Solo el creador del viaje puede añadir actividades incluidas" });
    return;
  }
  if (!isIncluded) {
    const eligible = role === "agent" || (role === "traveler" && access.memberType !== "guest");
    if (!eligible) {
      res.status(403).json({ error: "No tienes permiso para crear actividades por libre en este viaje" });
      return;
    }
  }

  let validParticipantIds: number[] = [];
  if (!isIncluded && Array.isArray(participantIds) && participantIds.length > 0) {
    const members = await listTripMembers(tripId);
    const memberIds = new Set(members.map(m => m.id));
    validParticipantIds = participantIds.filter((id: number) => memberIds.has(id) && id !== currentUserId);
  }

  const warning = await checkTimeCollision(dayId, startTime, endTime);

  const insertResult = await db.execute(sql`
    INSERT INTO trip_day_activities
      (day_id, activity_id, activity_title, sort_order, notes, start_time, end_time,
       company_contact, address_override, included, transport_mode, created_by_user_id,
       cost_amount, cost_currency)
    VALUES
      (${dayId}, ${activityId ?? null}, ${activityTitle ?? null}, ${sortOrder},
       ${notes ?? null}, ${startTime ?? null}, ${endTime ?? null},
       ${companyContact ?? null}, ${addressOverride ?? null}, ${isIncluded},
       ${transportMode ?? null}, ${currentUserId},
       ${costAmount ?? null}, ${costAmount != null ? "EUR" : null})
    RETURNING id, day_id, activity_id, activity_title, sort_order, notes, start_time, end_time,
              company_contact, address_override, included, transport_mode, created_by_user_id,
              cost_amount, cost_currency, created_at
  `);
  const link = insertResult.rows[0] as Record<string, unknown>;
  const linkId = Number(link.id);

  if (validParticipantIds.length > 0) {
    await db.insert(tripDayActivityParticipantsTable).values(
      validParticipantIds.map(travelerId => ({ activityLinkId: linkId, travelerId })),
    );
  }
  const participants = await getActivityParticipants(linkId);

  let actName: string | null = null;
  let actCategory: string | null = null;
  let actAddress: string | null = null;
  let actDurationHours: number | null = null;

  if (activityId) {
    const [act] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, activityId));
    actName = act?.name ?? null;
    actCategory = act?.category ?? null;
    actAddress = act?.address ?? null;
    actDurationHours = act?.durationHours != null ? parseFloat(act.durationHours) : null;
  }

  const createdByUserId = link.created_by_user_id != null ? Number(link.created_by_user_id) : null;
  const canEdit = canManageActivity(trip, { included: Boolean(link.included), createdByUserId }, session);

  res.status(201).json(serializeDayActivity({
    id: linkId,
    dayId: Number(link.day_id),
    activityId: link.activity_id != null ? Number(link.activity_id) : null,
    activityTitle: link.activity_title as string | null,
    activityName: actName,
    activityCategory: actCategory,
    sortOrder: Number(link.sort_order),
    startTime: link.start_time as string | null,
    endTime: link.end_time as string | null,
    notes: link.notes as string | null,
    companyContact: link.company_contact as string | null,
    addressOverride: link.address_override as string | null,
    included: Boolean(link.included),
    transportMode: link.transport_mode as string | null,
    createdByUserId,
    address: actAddress,
    durationHours: actDurationHours,
    createdAt: String(link.created_at),
    canEdit,
    costAmount: link.cost_amount != null ? parseFloat(link.cost_amount as string) : null,
    costCurrency: link.cost_currency as string | null,
    createdByName: req.session.name ?? null,
    participants,
    warning,
  }));

  if (isAgencyStaff) {
    notifyTripUpdated(
      tripId,
      `<p style="margin:0">Actividad añadida: ${actName ?? activityTitle ?? "actividad"}</p>`,
      (err) => req.log.error({ err }, "Failed to send trip updated notifications"),
    );
  }
});

router.patch("/trips/:tripId/days/:dayId/activities/:linkId", requireAuth, validate(TripDayActivityUpdateSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const currentUserId = req.session.userId!;
  const role = req.session.role;

  // Verify trip/day access (authorization + IDOR prevention)
  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  const trip = access.trip!;
  const session = { userId: currentUserId, role, agencyId: req.session.agencyId };

  // Verify the link belongs to the specified day which belongs to the specified trip (prevents IDOR)
  const [existing] = await db
    .select({
      id: tripDayActivitiesTable.id,
      activityId: tripDayActivitiesTable.activityId,
      createdByUserId: tripDayActivitiesTable.createdByUserId,
      included: tripDayActivitiesTable.included,
      startTime: tripDayActivitiesTable.startTime,
      endTime: tripDayActivitiesTable.endTime,
    })
    .from(tripDayActivitiesTable)
    .innerJoin(tripDaysTable, eq(tripDayActivitiesTable.dayId, tripDaysTable.id))
    .where(and(
      eq(tripDayActivitiesTable.id, linkId),
      eq(tripDayActivitiesTable.dayId, dayId),
      eq(tripDaysTable.tripId, tripId),
    ));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  // #151: included activities are managed only by the trip creator; por-libre only by whoever
  // created that specific activity (replaces the old "any trip participant can edit" rule).
  if (!canManageActivity(trip, { included: existing.included, createdByUserId: existing.createdByUserId }, session)) {
    res.status(403).json({ error: "No tienes permiso para editar esta actividad" });
    return;
  }

  const isAgencyStaff = role === "admin" || role === "manager" || role === "agent";

  const {
    dayId: targetDayId,
    startTime,
    endTime,
    notes,
    companyContact,
    addressOverride,
    included,
    transportMode,
    activityTitle,
    costAmount,
  } = req.body;

  const patch: Record<string, unknown> = {};
  if (targetDayId !== undefined && targetDayId !== dayId) {
    // Moving to another day: the target day must belong to the same trip (IDOR prevention).
    const targetAccess = await verifyTripDayAccess(tripId, targetDayId, currentUserId, req.session.agencyId, role);
    if (!targetAccess.authorized) { res.status(403).json({ error: targetAccess.reason }); return; }
    patch.dayId = targetDayId;
  }
  if (startTime !== undefined) patch.startTime = startTime ?? null;
  if (endTime !== undefined) patch.endTime = endTime ?? null;
  if (notes !== undefined) patch.notes = notes ?? null;
  if (companyContact !== undefined) patch.companyContact = companyContact ?? null;
  if (addressOverride !== undefined) patch.addressOverride = addressOverride ?? null;
  if (included !== undefined) patch.included = included;
  if (transportMode !== undefined) patch.transportMode = transportMode ?? null;
  if (activityTitle !== undefined) patch.activityTitle = activityTitle ?? null;
  if (costAmount !== undefined) {
    patch.costAmount = costAmount ?? null;
    patch.costCurrency = costAmount != null ? "EUR" : null;
  }

  const effectiveDayId = (patch.dayId as number | undefined) ?? dayId;
  const effectiveStartTime = startTime !== undefined ? startTime : existing.startTime;
  const effectiveEndTime = endTime !== undefined ? endTime : existing.endTime;
  const warning = (startTime !== undefined || endTime !== undefined || targetDayId !== undefined)
    ? await checkTimeCollision(effectiveDayId, effectiveStartTime, effectiveEndTime, linkId)
    : null;

  const [updated] = await db
    .update(tripDayActivitiesTable)
    .set(patch)
    .where(eq(tripDayActivitiesTable.id, linkId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  let actName: string | null = null;
  let actCategory: string | null = null;
  let actAddress: string | null = null;
  let actDurationHours: number | null = null;

  if (updated.activityId) {
    const [act] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, updated.activityId));
    actName = act?.name ?? null;
    actCategory = act?.category ?? null;
    actAddress = act?.address ?? null;
    actDurationHours = act?.durationHours != null ? parseFloat(act.durationHours) : null;
  }

  const canEdit = canManageActivity(trip, { included: updated.included, createdByUserId: updated.createdByUserId ?? null }, session);
  const [creator] = updated.createdByUserId != null
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, updated.createdByUserId))
    : [];
  const participants = await getActivityParticipants(updated.id);

  res.json(serializeDayActivity({
    id: updated.id,
    dayId: updated.dayId,
    activityId: updated.activityId ?? null,
    activityTitle: updated.activityTitle ?? null,
    activityName: actName,
    activityCategory: actCategory,
    sortOrder: updated.sortOrder,
    startTime: updated.startTime ?? null,
    endTime: updated.endTime ?? null,
    notes: updated.notes ?? null,
    companyContact: updated.companyContact ?? null,
    addressOverride: updated.addressOverride ?? null,
    included: updated.included,
    transportMode: updated.transportMode ?? null,
    createdByUserId: updated.createdByUserId ?? null,
    address: actAddress,
    durationHours: actDurationHours,
    createdAt: updated.createdAt.toISOString(),
    canEdit,
    costAmount: updated.costAmount != null ? parseFloat(updated.costAmount) : null,
    costCurrency: updated.costCurrency ?? null,
    createdByName: creator?.name ?? null,
    participants,
    warning,
  }));

  if (isAgencyStaff) {
    notifyTripUpdated(
      tripId,
      `<p style="margin:0">Actividad actualizada: ${actName ?? updated.activityTitle ?? "actividad"}</p>`,
      (err) => req.log.error({ err }, "Failed to send trip updated notifications"),
    );
  }
});

router.delete("/trips/:tripId/days/:dayId/activities/:linkId", requireAuth, async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const currentUserId = req.session.userId!;
  const role = req.session.role;

  // Verify trip/day access (authorization + IDOR prevention)
  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  const trip = access.trip!;
  const session = { userId: currentUserId, role, agencyId: req.session.agencyId };

  // Verify the link belongs to the specified day/trip (prevents IDOR)
  const [existing] = await db
    .select({ id: tripDayActivitiesTable.id, createdByUserId: tripDayActivitiesTable.createdByUserId, included: tripDayActivitiesTable.included })
    .from(tripDayActivitiesTable)
    .innerJoin(tripDaysTable, eq(tripDayActivitiesTable.dayId, tripDaysTable.id))
    .where(and(
      eq(tripDayActivitiesTable.id, linkId),
      eq(tripDayActivitiesTable.dayId, dayId),
      eq(tripDaysTable.tripId, tripId),
    ));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  // #151: included activities are managed only by the trip creator; por-libre only by whoever
  // created that specific activity.
  if (!canManageActivity(trip, { included: existing.included, createdByUserId: existing.createdByUserId }, session)) {
    res.status(403).json({ error: "No tienes permiso para eliminar esta actividad" });
    return;
  }

  await db.execute(sql`DELETE FROM trip_day_activities WHERE id = ${linkId}`);
  res.sendStatus(204);

  const isAgencyStaff = role === "admin" || role === "manager" || role === "agent";
  if (isAgencyStaff) {
    notifyTripUpdated(
      tripId,
      `<p style="margin:0">Se ha eliminado una actividad del itinerario.</p>`,
      (err) => req.log.error({ err }, "Failed to send trip updated notifications"),
    );
  }
});

// ─── TRIP DAY ACTIVITY PARTICIPANTS (#151) ────────────────────────────────────
// Gated to the activity's own creator (canManageActivity's por-libre branch) -- participants
// themselves have no management rights, matching the card's decision that a participant can't
// add/remove anyone, including themselves.
router.post("/trips/:tripId/days/:dayId/activities/:linkId/participants", requireAuth, async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const currentUserId = req.session.userId!;
  const role = req.session.role;
  const travelerId = Number(req.body?.travelerId);

  if (!Number.isInteger(travelerId) || travelerId <= 0) {
    res.status(400).json({ error: "travelerId is required" });
    return;
  }

  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  const trip = access.trip!;
  const session = { userId: currentUserId, role, agencyId: req.session.agencyId };

  const [existing] = await db
    .select({ id: tripDayActivitiesTable.id, createdByUserId: tripDayActivitiesTable.createdByUserId, included: tripDayActivitiesTable.included })
    .from(tripDayActivitiesTable)
    .innerJoin(tripDaysTable, eq(tripDayActivitiesTable.dayId, tripDaysTable.id))
    .where(and(
      eq(tripDayActivitiesTable.id, linkId),
      eq(tripDayActivitiesTable.dayId, dayId),
      eq(tripDaysTable.tripId, tripId),
    ));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.included || !canManageActivity(trip, { included: existing.included, createdByUserId: existing.createdByUserId }, session)) {
    res.status(403).json({ error: "Solo el creador de la actividad puede gestionar sus participantes" });
    return;
  }

  const members = await listTripMembers(tripId);
  if (!members.some(m => m.id === travelerId) || travelerId === existing.createdByUserId) {
    res.status(400).json({ error: "El viajero no forma parte de este viaje" });
    return;
  }

  await db.insert(tripDayActivityParticipantsTable)
    .values({ activityLinkId: linkId, travelerId })
    .onConflictDoNothing();

  res.status(201).json({ participants: await getActivityParticipants(linkId) });
});

router.delete("/trips/:tripId/days/:dayId/activities/:linkId/participants/:travelerId", requireAuth, async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const travelerId = parseInt(Array.isArray(req.params.travelerId) ? req.params.travelerId[0] : req.params.travelerId, 10);
  const currentUserId = req.session.userId!;
  const role = req.session.role;

  const access = await verifyTripDayAccess(tripId, dayId, currentUserId, req.session.agencyId, role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  const trip = access.trip!;
  const session = { userId: currentUserId, role, agencyId: req.session.agencyId };

  const [existing] = await db
    .select({ id: tripDayActivitiesTable.id, createdByUserId: tripDayActivitiesTable.createdByUserId, included: tripDayActivitiesTable.included })
    .from(tripDayActivitiesTable)
    .innerJoin(tripDaysTable, eq(tripDayActivitiesTable.dayId, tripDaysTable.id))
    .where(and(
      eq(tripDayActivitiesTable.id, linkId),
      eq(tripDayActivitiesTable.dayId, dayId),
      eq(tripDaysTable.tripId, tripId),
    ));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.included || !canManageActivity(trip, { included: existing.included, createdByUserId: existing.createdByUserId }, session)) {
    res.status(403).json({ error: "Solo el creador de la actividad puede gestionar sus participantes" });
    return;
  }

  await db.delete(tripDayActivityParticipantsTable).where(and(
    eq(tripDayActivityParticipantsTable.activityLinkId, linkId),
    eq(tripDayActivityParticipantsTable.travelerId, travelerId),
  ));

  res.status(200).json({ participants: await getActivityParticipants(linkId) });
});

// Traveler-reachable trip member list (owner/invited/member-share travelers), used by the
// por-libre activity participant picker (#151).
router.get("/trips/:tripId/members", requireAuth, async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const currentUserId = req.session.userId!;

  const access = await verifyTripAccessCore(tripId, currentUserId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }

  res.json({ members: await listTripMembers(tripId) });
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

router.patch("/trips/:tripId", requireRoles("admin", "manager", "agent"), validate(TripUpdateSchema), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const fields = req.body;
  const [before] = await db.select({ startDate: tripsTable.startDate, endDate: tripsTable.endDate }).from(tripsTable).where(eq(tripsTable.id, id));
  const [trip] = await db.update(tripsTable).set(fields).where(eq(tripsTable.id, id)).returning();
  if (!trip) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeTrip({ ...trip, itineraryName: null, invitedCount: 0, acceptedCount: 0 }));

  const changes: string[] = [];
  if (fields.startDate !== undefined && before && fields.startDate !== before.startDate) {
    changes.push(`Nueva fecha de inicio: ${fields.startDate}`);
  }
  if (fields.endDate !== undefined && before && fields.endDate !== before.endDate) {
    changes.push(`Nueva fecha de fin: ${fields.endDate ?? "sin definir"}`);
  }
  if (changes.length > 0) {
    notifyTripUpdated(
      id,
      changes.map(c => `<p style="margin:0 0 4px">${c}</p>`).join(""),
      (err) => req.log.error({ err }, "Failed to send trip updated notifications"),
    );
  }
});

// ─── Back-office document endpoints ──────────────────────────────────────────

async function verifyTripAccess(tripId: number, userId: number, agencyId: number | null | undefined, role: string | undefined): Promise<boolean> {
  const [trip] = await db
    .select({ id: tripsTable.id, agencyId: tripsTable.agencyId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  if (!trip) return false;
  if (role === "admin") return true;
  if ((role === "manager" || role === "agent") && agencyId != null && trip.agencyId === agencyId) return true;
  return false;
}

router.get("/trips/:tripId/travel-advisories", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const countries = await getTripCountries(tripId);
  if (countries.length === 0) { res.json({ international: false, advisories: [] }); return; }

  await Promise.all(countries.map(c => ensureCountryAdvisoryFresh(c)));

  const rows = await db
    .select()
    .from(countryAdvisoriesTable)
    .where(inArray(countryAdvisoriesTable.countryName, countries));
  const rowByCountry = new Map(rows.map(r => [r.countryName, r]));

  const advisories = countries.map(countryName => {
    const row = rowByCountry.get(countryName);
    return {
      countryName,
      sourceUrl: row?.sourceUrl ?? buildAdvisoryUrl(countryName),
      contentText: row?.contentText ?? null,
      officialUpdatedAt: row?.officialUpdatedAt ?? null,
      lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
      lastChangedAt: row?.lastChangedAt?.toISOString() ?? null,
      changed: false,
    };
  });

  res.json({ international: true, advisories });
});

// #153: the back office never sees a traveler's own documents, by any route -- only what the
// agency itself uploaded. Filtering by uploader role, not a parallel origin column.
router.get("/trips/:tripId/documents", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

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
    .innerJoin(usersTable, eq(usersTable.id, tripDocumentsTable.userId))
    .where(and(eq(tripDocumentsTable.tripId, tripId), inArray(usersTable.role, ["admin", "manager", "agent"])))
    .orderBy(tripDocumentsTable.createdAt);
  res.json(docs.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), uploaderRole: d.uploaderRole ?? "traveler" })));
});

router.post("/trips/:tripId/documents", requireRoles("admin", "manager", "agent"), validate(TripDocumentInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { filename, mimeType, storageKey } = req.body as { filename: string; mimeType: string; storageKey: string };

  if (!storageKey.startsWith("/objects/")) {
    res.status(400).json({ error: "Invalid storage key" }); return;
  }

  const [doc] = await db
    .insert(tripDocumentsTable)
    .values({ tripId, userId: userId!, filename, mimeType, storageKey })
    .returning();
  res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString(), uploaderRole: role! });

  // Fire-and-forget: notify accepted travelers
  (async () => {
    try {
      const [tripRow] = await db
        .select({ name: tripsTable.name, agencyId: tripsTable.agencyId })
        .from(tripsTable)
        .where(eq(tripsTable.id, tripId));
      if (!tripRow) return;

      if (!tripRow.agencyId) return;
      const [agency] = await db
        .select({ name: agenciesTable.name })
        .from(agenciesTable)
        .where(eq(agenciesTable.id, tripRow.agencyId));
      if (!agency) return;

      const accepted = await db
        .select({
          email: invitationsTable.email,
          name: usersTable.name,
        })
        .from(invitationsTable)
        .leftJoin(usersTable, eq(usersTable.id, invitationsTable.travelerId))
        .where(
          and(
            eq(invitationsTable.tripId, tripId),
            eq(invitationsTable.status, "accepted"),
          ),
        );

      // Same fix as the trip-updated email above: plain path, traveler-facing route. The
      // traveler trip page has no per-tab deep link yet, so this lands on the trip's default
      // tab rather than Documentos specifically.
      const tripUrl = `${PUBLIC_APP_URL}/traveler/trips/${tripId}`;

      await Promise.allSettled(
        accepted.map(t =>
          sendDocumentUploadedEmail({
            to: t.email,
            travelerName: t.name ?? null,
            tripName: tripRow.name,
            agencyName: agency.name,
            documentName: filename,
            tripUrl,
          }),
        ),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to send document upload notifications");
    }
  })();
});

router.patch("/trips/:tripId/documents/:documentId", requireRoles("admin", "manager", "agent"), validate(TripDocumentRenameSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [doc] = await db
    .select({ id: tripDocumentsTable.id, userId: tripDocumentsTable.userId, uploaderRole: usersTable.role })
    .from(tripDocumentsTable)
    .leftJoin(usersTable, eq(usersTable.id, tripDocumentsTable.userId))
    .where(and(eq(tripDocumentsTable.id, documentId), eq(tripDocumentsTable.tripId, tripId)));

  if (!doc || !doc.uploaderRole || !["admin", "manager", "agent"].includes(doc.uploaderRole)) {
    res.status(404).json({ error: "Not found" }); return;
  }

  if (role === "agent" && doc.userId !== userId) {
    res.status(403).json({ error: "Agents can only rename documents they uploaded" }); return;
  }

  const { filename } = req.body as { filename: string };

  const [updated] = await db
    .update(tripDocumentsTable)
    .set({ filename })
    .where(eq(tripDocumentsTable.id, documentId))
    .returning();
  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), uploaderRole: role! });
});

router.delete("/trips/:tripId/documents/:documentId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [doc] = await db
    .select({ id: tripDocumentsTable.id, userId: tripDocumentsTable.userId, storageKey: tripDocumentsTable.storageKey, uploaderRole: usersTable.role })
    .from(tripDocumentsTable)
    .leftJoin(usersTable, eq(usersTable.id, tripDocumentsTable.userId))
    .where(and(eq(tripDocumentsTable.id, documentId), eq(tripDocumentsTable.tripId, tripId)));

  if (!doc || !doc.uploaderRole || !["admin", "manager", "agent"].includes(doc.uploaderRole)) {
    res.status(404).json({ error: "Not found" }); return;
  }

  // Agents can only delete documents they uploaded
  if (role === "agent" && doc.userId !== userId) {
    res.status(403).json({ error: "Agents can only delete their own documents" }); return;
  }

  try {
    const file = await objectStorage.getObjectEntityFile(doc.storageKey);
    await file.delete();
  } catch (_) {
    // Best-effort delete from storage
  }

  await db.delete(tripDocumentsTable).where(eq(tripDocumentsTable.id, documentId));
  res.sendStatus(204);
});

router.get("/trips/:tripId/documents/:documentId/download", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [doc] = await db
    .select({ storageKey: tripDocumentsTable.storageKey, uploaderRole: usersTable.role })
    .from(tripDocumentsTable)
    .leftJoin(usersTable, eq(usersTable.id, tripDocumentsTable.userId))
    .where(and(eq(tripDocumentsTable.id, documentId), eq(tripDocumentsTable.tripId, tripId)));

  if (!doc || !doc.uploaderRole || !["admin", "manager", "agent"].includes(doc.uploaderRole)) {
    res.status(404).json({ error: "Not found" }); return;
  }

  try {
    const signedUrl = await objectStorage.getSignedDownloadUrl(doc.storageKey, 900);
    res.json({ signedUrl });
  } catch (err) {
    req.log.error({ err }, "Error generating signed download URL");
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

// ─── Back-office link endpoints ("Enlaces") ───────────────────────────────────
// Independent feature reusing trip_documents' ownership/visibility pattern exactly (#153):
// the back office never sees a traveler's own links, by any route -- only what the agency
// itself created. Filtering by uploader role, not a parallel origin column.
router.get("/trips/:tripId/links", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const links = await db
    .select({
      id: tripLinksTable.id,
      tripId: tripLinksTable.tripId,
      userId: tripLinksTable.userId,
      title: tripLinksTable.title,
      url: tripLinksTable.url,
      createdAt: tripLinksTable.createdAt,
      uploaderRole: usersTable.role,
    })
    .from(tripLinksTable)
    .innerJoin(usersTable, eq(usersTable.id, tripLinksTable.userId))
    .where(and(eq(tripLinksTable.tripId, tripId), inArray(usersTable.role, ["admin", "manager", "agent"])))
    .orderBy(tripLinksTable.createdAt);
  res.json(links.map(l => ({ ...l, createdAt: l.createdAt.toISOString(), uploaderRole: l.uploaderRole ?? "traveler" })));
});

router.post("/trips/:tripId/links", requireRoles("admin", "manager", "agent"), validate(TripLinkInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { title, url } = req.body as { title: string; url: string };

  const [link] = await db
    .insert(tripLinksTable)
    .values({ tripId, userId: userId!, title, url })
    .returning();
  res.status(201).json({ ...link, createdAt: link.createdAt.toISOString(), uploaderRole: role! });
});

router.delete("/trips/:tripId/links/:linkId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [link] = await db
    .select({ id: tripLinksTable.id, userId: tripLinksTable.userId, uploaderRole: usersTable.role })
    .from(tripLinksTable)
    .leftJoin(usersTable, eq(usersTable.id, tripLinksTable.userId))
    .where(and(eq(tripLinksTable.id, linkId), eq(tripLinksTable.tripId, tripId)));

  if (!link || !link.uploaderRole || !["admin", "manager", "agent"].includes(link.uploaderRole)) {
    res.status(404).json({ error: "Not found" }); return;
  }

  // Agents can only delete links they created
  if (role === "agent" && link.userId !== userId) {
    res.status(403).json({ error: "Agents can only delete their own links" }); return;
  }

  await db.delete(tripLinksTable).where(eq(tripLinksTable.id, linkId));
  res.sendStatus(204);
});

// ─── Back-office note endpoints (#153) ────────────────────────────────────────
// Agency notes are a new concept: previously trip_notes only had traveler-authored rows.
// Same visibility rule as documents -- the back office only ever sees/manages its own notes,
// never a traveler's; travelers see these via GET /me/trips/:tripId/notes (traveler.ts).
router.get("/trips/:tripId/notes", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const notes = await db
    .select({
      id: tripNotesTable.id,
      tripId: tripNotesTable.tripId,
      userId: tripNotesTable.userId,
      dayNumber: tripNotesTable.dayNumber,
      endDayNumber: tripNotesTable.endDayNumber,
      content: tripNotesTable.content,
      createdAt: tripNotesTable.createdAt,
      updatedAt: tripNotesTable.updatedAt,
      uploaderRole: usersTable.role,
    })
    .from(tripNotesTable)
    .innerJoin(usersTable, eq(usersTable.id, tripNotesTable.userId))
    .where(and(eq(tripNotesTable.tripId, tripId), inArray(usersTable.role, ["admin", "manager", "agent"])))
    .orderBy(tripNotesTable.dayNumber);
  res.json(notes.map(n => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString(), uploaderRole: n.uploaderRole ?? "traveler" })));
});

router.post("/trips/:tripId/notes", requireRoles("admin", "manager", "agent"), validate(TripNoteInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { content, dayNumber, endDayNumber } = req.body as { content: string; dayNumber?: number | null; endDayNumber?: number | null };
  const [note] = await db
    .insert(tripNotesTable)
    .values({ tripId, userId: userId!, content: sanitizeNoteHtml(content), dayNumber, endDayNumber })
    .returning();
  res.status(201).json({ ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(), uploaderRole: role! });
});

router.patch("/trips/:tripId/notes/:noteId", requireRoles("admin", "manager", "agent"), validate(TripNoteUpdateSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [existing] = await db
    .select({ id: tripNotesTable.id, userId: tripNotesTable.userId, uploaderRole: usersTable.role })
    .from(tripNotesTable)
    .leftJoin(usersTable, eq(usersTable.id, tripNotesTable.userId))
    .where(and(eq(tripNotesTable.id, noteId), eq(tripNotesTable.tripId, tripId)));

  if (!existing || !existing.uploaderRole || !["admin", "manager", "agent"].includes(existing.uploaderRole)) {
    res.status(404).json({ error: "Not found" }); return;
  }
  if (role === "agent" && existing.userId !== userId) {
    res.status(403).json({ error: "Agents can only edit notes they created" }); return;
  }

  const { content, dayNumber, endDayNumber } = req.body as { content: string; dayNumber?: number | null; endDayNumber?: number | null };
  const patch: Record<string, unknown> = { content: sanitizeNoteHtml(content) };
  if (dayNumber !== undefined) patch.dayNumber = dayNumber;
  if (endDayNumber !== undefined) patch.endDayNumber = endDayNumber;

  const [note] = await db
    .update(tripNotesTable)
    .set(patch)
    .where(eq(tripNotesTable.id, noteId))
    .returning();
  res.json({ ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(), uploaderRole: role! });
});

router.delete("/trips/:tripId/notes/:noteId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { userId, agencyId, role } = req.session;

  if (!await verifyTripAccess(tripId, userId!, agencyId, role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [existing] = await db
    .select({ id: tripNotesTable.id, userId: tripNotesTable.userId, uploaderRole: usersTable.role })
    .from(tripNotesTable)
    .leftJoin(usersTable, eq(usersTable.id, tripNotesTable.userId))
    .where(and(eq(tripNotesTable.id, noteId), eq(tripNotesTable.tripId, tripId)));

  if (!existing || !existing.uploaderRole || !["admin", "manager", "agent"].includes(existing.uploaderRole)) {
    res.status(404).json({ error: "Not found" }); return;
  }
  if (role === "agent" && existing.userId !== userId) {
    res.status(403).json({ error: "Agents can only delete notes they created" }); return;
  }

  await db.delete(tripNotesTable).where(eq(tripNotesTable.id, noteId));
  res.sendStatus(204);
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
