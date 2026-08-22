import { Router, type IRouter } from "express";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  tripsTable, tripDaysTable,
  agenciesTable, hotelsTable, tripNotesTable, itinerariesTable,
  itineraryDaysTable, tripDayHotelsTable, itineraryDayHotelsTable,
  tripDayActivitiesTable, itineraryDayActivitiesTable,
  tripSharesTable, usersTable, activitiesTable,
  tripChecklistItemsTable, checklistTemplatesTable,
  userCountriesTable, tripPhotoSharesTable,
  tripDocumentSharesTable, tripNoteSharesTable,
  tripLinksTable, tripLinkSharesTable,
} from "@workspace/db";
import type { TripPhotoSnapshot, TripPhotoSnapshotDay } from "@workspace/db";
import { COUNTRY_NAME_BY_CODE, COUNTRY_CODE_BY_NAME } from "@workspace/db/countries";
import { requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import {
  PersonalTripInputSchema, PersonalTripUpdateSchema,
  PersonalTripDayInputSchema, PersonalTripDayUpdateSchema,
  TripNoteInputSchema, TripNoteUpdateSchema,
  ShareTripInputSchema, UpdateShareInputSchema,
  TripDocumentInputSchema, TripResourceSharesInputSchema, TripLinkInputSchema,
  CreateTripChecklistInputSchema, TripChecklistItemInputSchema, TripChecklistItemUpdateSchema,
  TripPackingItemInputSchema, TripPackingItemUpdateSchema,
  UserCountryInputSchema, UserCountryStatusUpdateSchema,
  TripClassificationUpdateSchema,
} from "../lib/schemas";
import { tripDocumentsTable, tripPackingItemsTable, countryAdvisoriesTable, tripAdvisoryViewsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { generatePackingList } from "../lib/packing-list-generator";
import { getTripCountries, ensureCountryAdvisoryFresh } from "../lib/travel-advisory-refresh";
import { buildAdvisoryUrl } from "../lib/travel-advisory-scraper";
import { sanitizeNoteHtml } from "../lib/sanitize";
import { geocodeCity } from "../lib/geocoding";
import { repositionDay, shiftTripNotesForReposition } from "../lib/day-renumbering";
import { sendTripShareInvitationEmail } from "../lib/email";
import { PUBLIC_APP_URL } from "../lib/publicUrl";
import {
  defaultDateBasedClassification, ensureTripClassification,
  ensureTripClassificationByDates, getTripClassification, setTripClassification,
} from "../lib/trip-classification";
import { tripClassificationsTable } from "@workspace/db";
import type { TripClassificationValue } from "@workspace/db";
import { verifyTripAccessCore, listTripMembers } from "./trips";
import { backfillSharedWithAll } from "../lib/shared-with-all-backfill";

// Roles whose uploads/authoring count as "agency" origin (#153): derived from the author's role,
// no parallel origin column on trip_documents/trip_notes.
const AGENCY_STAFF_ROLES = new Set(["admin", "manager", "agent"]);

const objectStorage = new ObjectStorageService();

const SUGGESTED_CHECKLIST_ITEMS = [
  "Visado confirmado",
  "Seguro de viaje contratado",
  "Vacunas revisadas",
  "Alojamiento reservado",
  "Cambio de moneda",
  "Descargar mapas offline",
  "Registro del viajero en la app del Ministerio de Asuntos Exteriores",
];

function makeShareCode(): string {
  return randomBytes(6).toString("base64url").toUpperCase();
}

// Long single-use token for trip_shares invites (task #161) — unlike makeShareCode above
// (still used for trip-photo "snapshot" links, out of scope for #161), this is never meant
// to be typed by a human, only embedded in an email link.
function makeInviteToken(): string {
  return randomBytes(32).toString("hex");
}

const COLD_INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
      cityFromCountry: d.cityFromCountry ?? null,
      cityToCountry: d.cityToCountry ?? null,
      transport: d.transport ?? null,
      description: d.description ?? null,
      isTransitNight: d.isTransitNight ?? false,
      photoUrl: d.photoUrl ?? null,
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
  hotelAddress: string | null; hotelPhone: string | null; hotelWebsite: string | null;
  segment: string | null; createdAt: Date;
}) {
  return { id: r.id, hotelId: r.hotelId, hotelName: r.hotelName, hotelCity: r.hotelCity, hotelAddress: r.hotelAddress, hotelPhone: r.hotelPhone, hotelWebsite: r.hotelWebsite, segment: r.segment, createdAt: r.createdAt.toISOString() };
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
      hotelAddress: hotelsTable.address,
      hotelPhone: hotelsTable.phone,
      hotelWebsite: hotelsTable.website,
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

// #151: `currentUserId` now actually gates visibility and edit rights, instead of being
// accepted-but-ignored. A por-libre activity (included = false) is only returned to its creator
// or its participants; an included activity is editable only by the trip's owner (this router is
// traveler-only, so "trip creator" here always means the personal-trip owner -- agency staff
// never call these /me/... routes). `tripOwnerId` lets every caller share one owner lookup
// instead of re-querying trips per call.
async function getTripDayActivityMap(dayIds: number[], currentUserId: number, tripOwnerId: number | null) {
  type ActivityItem = {
    id: number; activityId: number | null; activityName: string; activityCategory: string | null;
    startTime: string | null; endTime: string | null; address: string | null; addressOverride: string | null;
    description: string | null;
    durationHours: number | null; notes: string | null; companyContact: string | null;
    included: boolean; transportMode: string | null; canEdit: boolean;
    costAmount: number | null; costCurrency: string | null;
    isMine: boolean; participants: { id: number; name: string }[];
    sharedWithAll?: boolean;
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
      tda.created_by_user_id, tda.cost_amount, tda.cost_currency, tda.shared_with_all,
      a.address AS activity_address, a.description AS activity_description, a.duration_hours AS activity_duration_hours,
      EXISTS(
        SELECT 1 FROM trip_day_activity_participants p
        WHERE p.activity_link_id = tda.id AND p.traveler_id = ${currentUserId}
      ) AS is_participant,
      COALESCE((
        SELECT json_agg(json_build_object('id', u.id, 'name', u.name))
        FROM trip_day_activity_participants p
        JOIN users u ON u.id = p.traveler_id
        WHERE p.activity_link_id = tda.id
      ), '[]') AS participants
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
    const included = Boolean(r.included);
    const createdByUserId = r.created_by_user_id != null ? Number(r.created_by_user_id) : null;
    const isCreator = createdByUserId === currentUserId;
    const isParticipant = Boolean(r.is_participant);

    // Visibility: an included activity is visible to everyone with access to the trip; a
    // por-libre activity is visible only to its creator and its participants.
    if (!included && !isCreator && !isParticipant) continue;

    const dayId = Number(r.day_id);
    if (!map[dayId]) map[dayId] = [];
    const canEdit = included ? tripOwnerId === currentUserId : isCreator;
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
      description: r.activity_description as string | null,
      durationHours: r.activity_duration_hours != null ? parseFloat(r.activity_duration_hours as string) : null,
      included,
      transportMode: r.transport_mode as string | null,
      canEdit,
      costAmount: r.cost_amount != null ? parseFloat(r.cost_amount as string) : null,
      costCurrency: r.cost_currency as string | null,
      isMine: isCreator || isParticipant,
      participants: r.participants as { id: number; name: string }[],
      sharedWithAll: isCreator ? Boolean(r.shared_with_all) : undefined,
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

router.get("/me/profile", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [me] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!me) { res.status(404).json({ error: "User not found" }); return; }

  // Collect all trip IDs the user has access to
  const ownedTripIds = (await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(eq(tripsTable.ownerId, userId))).map(r => r.id);

  const sharedTripIds = (await db
    .select({ tripId: tripSharesTable.tripId })
    .from(tripSharesTable)
    .where(and(
      or(eq(tripSharesTable.sharedWithUserId, userId), eq(tripSharesTable.sharedWithEmail, me.email)),
      eq(tripSharesTable.status, "accepted"),
    ))).map(r => r.tripId);

  const allTripIds = [...new Set([...ownedTripIds, ...sharedTripIds])];
  const tripCount = allTripIds.length;

  // "Países visitados" is a manual list (userCountriesTable), not auto-derived from trips —
  // having a trip to a country doesn't imply it was visited (see task #139).
  const visitedRows = await db
    .select({ countryCode: userCountriesTable.countryCode })
    .from(userCountriesTable)
    .where(and(eq(userCountriesTable.userId, userId), eq(userCountriesTable.status, "visitado")));
  const countriesVisited = visitedRows
    .map(r => COUNTRY_NAME_BY_CODE[r.countryCode])
    .filter((n): n is string => !!n)
    .sort();

  res.json({ id: me.id, name: me.name, email: me.email, createdAt: me.createdAt, tripCount, countriesVisited });
});

// ─── Mis países (visitados / objetivo) ─────────────────────────────────────

router.get("/me/countries", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rows = await db
    .select({ countryCode: userCountriesTable.countryCode, status: userCountriesTable.status })
    .from(userCountriesTable)
    .where(eq(userCountriesTable.userId, userId));

  res.json(rows.map(r => ({
    countryCode: r.countryCode,
    countryName: COUNTRY_NAME_BY_CODE[r.countryCode] ?? r.countryCode,
    status: r.status,
  })));
});

router.post("/me/countries", requireRoles("traveler"), validate(UserCountryInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { countryCode, status } = req.body as { countryCode: string; status: "visitado" | "objetivo" };

  const [existing] = await db
    .select({ status: userCountriesTable.status })
    .from(userCountriesTable)
    .where(and(eq(userCountriesTable.userId, userId), eq(userCountriesTable.countryCode, countryCode)));

  if (existing) {
    res.status(409).json({ error: "AlreadyClassified", status: existing.status });
    return;
  }

  const [row] = await db
    .insert(userCountriesTable)
    .values({ userId, countryCode, status })
    .returning();

  res.status(201).json({ countryCode: row.countryCode, countryName: COUNTRY_NAME_BY_CODE[row.countryCode] ?? row.countryCode, status: row.status });
});

router.patch("/me/countries/:countryCode", requireRoles("traveler"), validate(UserCountryStatusUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const countryCode = (Array.isArray(req.params.countryCode) ? req.params.countryCode[0] : req.params.countryCode).toUpperCase();
  const { status } = req.body as { status: "visitado" | "objetivo" };

  const [row] = await db
    .update(userCountriesTable)
    .set({ status })
    .where(and(eq(userCountriesTable.userId, userId), eq(userCountriesTable.countryCode, countryCode)))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ countryCode: row.countryCode, countryName: COUNTRY_NAME_BY_CODE[row.countryCode] ?? row.countryCode, status: row.status });
});

router.delete("/me/countries/:countryCode", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const countryCode = (Array.isArray(req.params.countryCode) ? req.params.countryCode[0] : req.params.countryCode).toUpperCase();

  const [row] = await db
    .delete(userCountriesTable)
    .where(and(eq(userCountriesTable.userId, userId), eq(userCountriesTable.countryCode, countryCode)))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  res.status(204).send();
});

router.get("/me/trips", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  // 1. Personal trips (ownerId = userId)
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

  // 3. Accepted shares — always included here now, classified as "compartido" by
  // default (task #140); the traveler can reclassify to Programado/Realizado manually.
  const [meRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = meRow?.email ?? "";

  const sharedRows = await db
    .select({
      id: tripsTable.id,
      name: tripsTable.name,
      status: tripsTable.status,
      startDate: tripsTable.startDate,
      endDate: tripsTable.endDate,
      agencyName: agenciesTable.name,
      agencyLogoUrl: sql<string | null>`COALESCE(${agenciesTable.logoFileUrl}, ${agenciesTable.logoUrl})`,
      countries: itinerariesTable.countries,
      ownerId: tripsTable.ownerId,
      memberType: tripSharesTable.memberType,
      createdAt: tripsTable.createdAt,
    })
    .from(tripSharesTable)
    .innerJoin(tripsTable, eq(tripsTable.id, tripSharesTable.tripId))
    .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
    .leftJoin(itinerariesTable, eq(tripsTable.itineraryId, itinerariesTable.id))
    .where(and(
      or(
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.sharedWithEmail, myEmail),
      ),
      eq(tripSharesTable.status, "accepted"),
    ));

  const classificationRows = await db
    .select({ tripId: tripClassificationsTable.tripId, classification: tripClassificationsTable.classification })
    .from(tripClassificationsTable)
    .where(eq(tripClassificationsTable.userId, userId));
  const classificationByTripId = new Map(classificationRows.map(r => [r.tripId, r.classification]));

  const trips = [];

  // Add personal trips (owned)
  for (const row of personalRows) {
    trips.push({
      ...row,
      isPersonal: true,
      ownerId: userId,
      agencyName: null,
      agencyLogoUrl: null,
      countries: [],
      classification: classificationByTripId.get(row.id) ?? defaultDateBasedClassification(row.startDate, row.endDate),
      createdAt: row.createdAt.toISOString(),
    });
  }

  // Add invited (agency) + shared (traveler-to-traveler) trips
  const seenIds = new Set(trips.map(t => t.id));
  for (const { memberType, ...row } of sharedRows) {
    if (seenIds.has(row.id)) continue; // avoid duplicates with owned trips
    trips.push({
      ...row,
      isPersonal: row.ownerId != null && row.agencyName == null,
      ownerId: row.agencyName != null ? null : row.ownerId,
      countries: row.countries ?? [],
      agencyName: row.agencyName ?? null,
      agencyLogoUrl: row.agencyLogoUrl ?? null,
      // A "member" share defaults to date-based classification if none was recorded yet
      // (agency invite or #141 Miembro); a "guest" always defaults to "compartido" (#140).
      classification: classificationByTripId.get(row.id)
        ?? (memberType === "member" ? defaultDateBasedClassification(row.startDate, row.endDate) : "compartido"),
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

  const classification = defaultDateBasedClassification(trip.startDate, trip.endDate ?? null);
  await ensureTripClassification(userId, trip.id, classification);

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
    classification,
    createdAt: trip.createdAt.toISOString(),
  });
});

// ─── Get trip detail ─────────────────────────────────────────────────────────
router.get("/me/trips/:tripId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  // Access allowed if: trip owner OR accepted share (agency invite or #141 personal share)
  const [ownedTrip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));

  const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = me?.email ?? "";

  const [acceptedShare] = await db
    .select({ id: tripSharesTable.id, permission: tripSharesTable.permission, memberType: tripSharesTable.memberType })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      or(
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.sharedWithEmail, myEmail),
      ),
      eq(tripSharesTable.status, "accepted"),
    ));

  if (!ownedTrip && !acceptedShare) { res.status(404).json({ error: "Not found" }); return; }

  const myPermission: string | null = acceptedShare ? acceptedShare.permission : null;
  const myMemberType: string | null = acceptedShare ? acceptedShare.memberType : null;

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
      agencyLogoUrl: sql<string | null>`COALESCE(${agenciesTable.logoFileUrl}, ${agenciesTable.logoUrl})`,
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

  // Anyone with access to this trip (checked above: owner, accepted invitation, or accepted
  // share) may see the total "traveler count" — it's not sensitive, and this endpoint is
  // already the single role-safe source every viewer calls, so compute it accurately here
  // rather than relying on a permission-gated endpoint (e.g. GET /shares) client-side.
  let travelerCount: number;
  if (row.ownerId != null && row.agencyName == null) {
    // Personal trip: owner + everyone with an accepted share.
    const acceptedShares = await db
      .select({ id: tripSharesTable.id })
      .from(tripSharesTable)
      .where(and(eq(tripSharesTable.tripId, tripId), eq(tripSharesTable.status, "accepted")));
    travelerCount = acceptedShares.length + 1;
  } else {
    // Agency trip: no personal "owner" — count accepted invited travelers.
    const acceptedInvitations = await db
      .select({ id: tripSharesTable.id })
      .from(tripSharesTable)
      .where(and(
        eq(tripSharesTable.tripId, tripId),
        eq(tripSharesTable.origin, "agency"),
        eq(tripSharesTable.status, "accepted"),
      ));
    travelerCount = acceptedInvitations.length;
  }

  const currentUserId = req.session.userId!;
  let days: Array<Record<string, unknown>> = [];
  let effectiveTripDays = tripDayRows;

  if (tripDayRows.length > 0) {
    const [hotelMap, activityMap] = await Promise.all([
      getTravelerDayHotelMap(tripDayRows.map(d => d.id), "trip"),
      getTripDayActivityMap(tripDayRows.map(d => d.id), currentUserId, row.ownerId),
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
        getTripDayActivityMap(effectiveTripDays.map(d => d.id), currentUserId, row.ownerId),
      ]);
      await mergeItineraryFallbacks(row.itineraryId, effectiveTripDays, hotelMap, activityMap);
      days = effectiveTripDays.map(d => ({ ...d, hotels: hotelMap[d.id] ?? [], activities: activityMap[d.id] ?? [] }));
    }
  }

  const classification = (await getTripClassification(userId, tripId))
    ?? (ownedTrip || myMemberType === "member" ? defaultDateBasedClassification(row.startDate, row.endDate) : "compartido");

  res.json({
    ...row,
    isPersonal: row.ownerId != null && row.agencyName == null,
    myPermission,
    myMemberType,
    agencyName: row.agencyName ?? null,
    agencyLogoUrl: row.agencyLogoUrl ?? null,
    travelerCount,
    classification,
    createdAt: row.createdAt.toISOString(),
    daysSource: effectiveTripDays.length > 0 ? "trip" : "itinerary",
    days: days.map(d => ({ ...d, createdAt: (d.createdAt as Date).toISOString() })),
  });
});

// ─── Update trip classification (Programado / Realizado / Compartido) ───────
// Editable by the traveler at any time, regardless of how access was granted
// (own trip, agency invitation, or share) — see task #140 decisions.
router.patch("/me/trips/:tripId/classification", requireRoles("traveler"), validate(TripClassificationUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { classification } = req.body as { classification: TripClassificationValue };

  // Access allowed if: trip owner OR accepted share (agency invite or #141 personal share)
  const [ownedTrip] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const [acceptedShare] = await db
    .select({ id: tripSharesTable.id })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      or(
        eq(tripSharesTable.sharedWithUserId, userId),
        eq(tripSharesTable.sharedWithEmail, me?.email ?? ""),
      ),
      eq(tripSharesTable.status, "accepted"),
    ));

  if (!ownedTrip && !acceptedShare) { res.status(404).json({ error: "Not found" }); return; }

  await db
    .insert(tripClassificationsTable)
    .values({ userId, tripId, classification })
    .onConflictDoUpdate({
      target: [tripClassificationsTable.userId, tripClassificationsTable.tripId],
      set: { classification, updatedAt: new Date() },
    });

  res.json({ tripId, classification });
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
      agencyLogoUrl: sql<string | null>`COALESCE(${agenciesTable.logoFileUrl}, ${agenciesTable.logoUrl})`,
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

// ─── Map ─────────────────────────────────────────────────────────────────────
interface TripMapRawPoint {
  city: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  dayNumber: number;
  dayId: number;
  field: "cityFrom" | "cityTo";
}

router.get("/me/trips/:tripId/map", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  const days = await db
    .select()
    .from(tripDaysTable)
    .where(eq(tripDaysTable.tripId, tripId))
    .orderBy(tripDaysTable.dayNumber);

  // Raw waypoint sequence: day 1's cityFrom (the true starting point) followed by every day's
  // cityTo in order. Same-city days fall out naturally as consecutive duplicates, collapsed below.
  const raw: TripMapRawPoint[] = [];
  days.forEach((d, idx) => {
    if (idx === 0 && d.cityFrom?.trim()) {
      raw.push({ city: d.cityFrom.trim(), country: d.cityFromCountry, lat: d.cityFromLat, lng: d.cityFromLng, dayNumber: d.dayNumber, dayId: d.id, field: "cityFrom" });
    }
    if (d.cityTo?.trim()) {
      raw.push({ city: d.cityTo.trim(), country: d.cityToCountry, lat: d.cityToLat, lng: d.cityToLng, dayNumber: d.dayNumber, dayId: d.id, field: "cityTo" });
    }
  });

  // Lazily geocode + persist anything still missing coordinates -- days created before this
  // feature existed, or a geocode attempt that failed at save time (e.g. Mapbox hiccup).
  for (const point of raw) {
    if (point.lat == null || point.lng == null) {
      const geo = await geocodeCity(point.city, point.country);
      if (geo) {
        point.lat = geo.lat;
        point.lng = geo.lng;
        await db
          .update(tripDaysTable)
          .set(point.field === "cityFrom"
            ? { cityFromLat: geo.lat, cityFromLng: geo.lng }
            : { cityToLat: geo.lat, cityToLng: geo.lng })
          .where(eq(tripDaysTable.id, point.dayId));
      }
    }
  }

  // Collapse consecutive same-city points into one waypoint (case-insensitive), merging day numbers.
  const waypoints: { city: string; country: string | null; lat: number; lng: number; dayNumbers: number[] }[] = [];
  for (const point of raw) {
    if (point.lat == null || point.lng == null) continue; // geocoding failed -- skip rather than break the map
    const last = waypoints[waypoints.length - 1];
    if (last && last.city.toLowerCase() === point.city.toLowerCase()) {
      last.dayNumbers.push(point.dayNumber);
    } else {
      waypoints.push({ city: point.city, country: point.country, lat: point.lat, lng: point.lng, dayNumbers: [point.dayNumber] });
    }
  }

  res.json({ waypoints });
});

// ─── Notes ───────────────────────────────────────────────────────────────────
// Visibility (#153): same rule as documents -- agency-authored notes are visible to every trip
// member; a traveler's own note is visible only to its creator plus explicit trip_note_shares
// recipients. Resolved here in the query, never filtered client-side.
router.get("/me/trips/:tripId/notes", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }

  const notes = await db
    .select({
      id: tripNotesTable.id,
      tripId: tripNotesTable.tripId,
      userId: tripNotesTable.userId,
      dayNumber: tripNotesTable.dayNumber,
      endDayNumber: tripNotesTable.endDayNumber,
      content: tripNotesTable.content,
      sharedWithAll: tripNotesTable.sharedWithAll,
      createdAt: tripNotesTable.createdAt,
      updatedAt: tripNotesTable.updatedAt,
      uploaderRole: usersTable.role,
    })
    .from(tripNotesTable)
    .leftJoin(usersTable, eq(usersTable.id, tripNotesTable.userId))
    .where(and(
      eq(tripNotesTable.tripId, tripId),
      or(
        inArray(usersTable.role, ["admin", "manager", "agent"]),
        eq(tripNotesTable.userId, userId),
        sql`EXISTS(SELECT 1 FROM trip_note_shares s WHERE s.note_id = ${tripNotesTable.id} AND s.traveler_id = ${userId})`,
      ),
    ))
    .orderBy(tripNotesTable.dayNumber);

  const myNoteIds = notes.filter(n => n.userId === userId).map(n => n.id);
  const shareRows = myNoteIds.length > 0
    ? await db
        .select({ noteId: tripNoteSharesTable.noteId, id: usersTable.id, name: usersTable.name })
        .from(tripNoteSharesTable)
        .innerJoin(usersTable, eq(usersTable.id, tripNoteSharesTable.travelerId))
        .where(inArray(tripNoteSharesTable.noteId, myNoteIds))
    : [];
  const sharedWithByNote: Record<number, { id: number; name: string | null }[]> = {};
  for (const s of shareRows) (sharedWithByNote[s.noteId] ??= []).push({ id: s.id, name: s.name });

  res.json(notes.map(n => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    uploaderRole: n.uploaderRole ?? "traveler",
    sharedWith: n.userId === userId ? (sharedWithByNote[n.id] ?? []) : undefined,
    sharedWithAll: n.userId === userId ? n.sharedWithAll : undefined,
  })));
});

router.post("/me/trips/:tripId/notes", requireRoles("traveler"), validate(TripNoteInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  if (access.memberType === "guest") {
    res.status(403).json({ error: "Los invitados no pueden crear notas propias" }); return;
  }

  const { content, dayNumber, endDayNumber } = req.body;
  const [note] = await db
    .insert(tripNotesTable)
    .values({ tripId, userId, content: sanitizeNoteHtml(content), dayNumber, endDayNumber })
    .returning();
  res.status(201).json({ ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(), uploaderRole: "traveler", sharedWith: [] });
});

router.patch("/me/trips/:tripId/notes/:noteId", requireRoles("traveler"), validate(TripNoteUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { content, dayNumber, endDayNumber } = req.body;

  const patch: Record<string, unknown> = { content: sanitizeNoteHtml(content) };
  if (dayNumber !== undefined) patch.dayNumber = dayNumber;
  if (endDayNumber !== undefined) patch.endDayNumber = endDayNumber;

  const [note] = await db
    .update(tripNotesTable)
    .set(patch)
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

// Creator adds recipients to their own note. Same recipient rules as document shares (#153):
// trip members with member access only, validated against listTripMembers.
router.post("/me/trips/:tripId/notes/:noteId/shares", requireRoles("traveler"), validate(TripResourceSharesInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { travelerIds, shareWithAll } = req.body as { travelerIds: number[]; shareWithAll?: boolean };

  const [note] = await db
    .select()
    .from(tripNotesTable)
    .where(and(eq(tripNotesTable.id, noteId), eq(tripNotesTable.tripId, tripId), eq(tripNotesTable.userId, userId)));
  if (!note) { res.status(404).json({ error: "Not found" }); return; }

  const members = await listTripMembers(tripId);
  const memberIds = new Set(members.map(m => m.id));
  const validTravelerIds = travelerIds.filter(id => memberIds.has(id) && id !== userId);
  if (validTravelerIds.length === 0) { res.status(400).json({ error: "Ningún viajero válido para compartir" }); return; }

  await db.insert(tripNoteSharesTable)
    .values(validTravelerIds.map(travelerId => ({ noteId, travelerId })))
    .onConflictDoNothing();

  // "Compartir con todos" (shareWithAll): future joiners get backfilled a share row too, see
  // backfillSharedWithAll -- not just whoever happened to be a trip member at click time.
  if (shareWithAll) {
    await db.update(tripNotesTable).set({ sharedWithAll: true }).where(eq(tripNotesTable.id, noteId));
  }

  const shareRows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(tripNoteSharesTable)
    .innerJoin(usersTable, eq(usersTable.id, tripNoteSharesTable.travelerId))
    .where(eq(tripNoteSharesTable.noteId, noteId));
  res.status(201).json({ sharedWith: shareRows, sharedWithAll: !!shareWithAll || note.sharedWithAll });
});

// Removes a recipient; the creator can remove anyone, a recipient can remove themselves (leave).
router.delete("/me/trips/:tripId/notes/:noteId/shares/:travelerId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const travelerId = parseInt(Array.isArray(req.params.travelerId) ? req.params.travelerId[0] : req.params.travelerId, 10);

  const [note] = await db.select().from(tripNotesTable).where(eq(tripNotesTable.id, noteId));
  if (!note) { res.status(404).json({ error: "Not found" }); return; }

  const isCreator = note.userId === userId;
  const isSelfRemoval = travelerId === userId;
  if (!isCreator && !isSelfRemoval) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(tripNoteSharesTable).where(and(
    eq(tripNoteSharesTable.noteId, noteId),
    eq(tripNoteSharesTable.travelerId, travelerId),
  ));
  res.sendStatus(204);
});

// ─── Checklist ────────────────────────────────────────────────────────────────

function serializeChecklistItem(i: typeof tripChecklistItemsTable.$inferSelect) {
  return {
    ...i,
    completedAt: i.completedAt ? i.completedAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

// Verifies the traveler has access to the trip (owner, accepted invite, or accepted share)
// and returns the trip's agencyId (null for personal trips), or false if no access.
async function getTripChecklistAccess(tripId: number, userId: number): Promise<number | null | false> {
  const [ownedTrip] = await db
    .select({ id: tripsTable.id, agencyId: tripsTable.agencyId })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  if (ownedTrip) return ownedTrip.agencyId ?? null;

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

  if (!acceptedShare) return false;

  const [trip] = await db.select({ agencyId: tripsTable.agencyId }).from(tripsTable).where(eq(tripsTable.id, tripId));
  return trip ? (trip.agencyId ?? null) : false;
}

router.get("/me/trips/:tripId/checklist", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  const items = await db
    .select()
    .from(tripChecklistItemsTable)
    .where(and(eq(tripChecklistItemsTable.tripId, tripId), eq(tripChecklistItemsTable.userId, userId)))
    .orderBy(tripChecklistItemsTable.createdAt, tripChecklistItemsTable.id);
  res.json(items.map(serializeChecklistItem));
});

router.get("/me/trips/:tripId/checklist/suggestions", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const agencyId = await getTripChecklistAccess(tripId, userId);
  if (agencyId === false) { res.status(403).json({ error: "Forbidden" }); return; }

  let agencyTemplates: Array<typeof checklistTemplatesTable.$inferSelect> = [];
  if (agencyId) {
    agencyTemplates = await db
      .select()
      .from(checklistTemplatesTable)
      .where(and(eq(checklistTemplatesTable.agencyId, agencyId), eq(checklistTemplatesTable.active, true)))
      .orderBy(checklistTemplatesTable.title);
  }
  res.json({
    suggested: SUGGESTED_CHECKLIST_ITEMS,
    agency: agencyTemplates.map(t => ({ id: t.id, title: t.title })),
  });
});

router.post("/me/trips/:tripId/checklist", requireRoles("traveler"), validate(CreateTripChecklistInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { items } = req.body as { items: Array<{ title: string; origin: "suggested" | "agency" | "personal"; templateId?: number | null }> };

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  const existing = await db
    .select({ id: tripChecklistItemsTable.id })
    .from(tripChecklistItemsTable)
    .where(and(eq(tripChecklistItemsTable.tripId, tripId), eq(tripChecklistItemsTable.userId, userId)));
  if (existing.length > 0) { res.status(409).json({ error: "Checklist already exists for this trip" }); return; }

  const inserted = await db
    .insert(tripChecklistItemsTable)
    .values(items.map(item => ({
      tripId, userId, title: item.title, origin: item.origin, templateId: item.templateId ?? null,
    })))
    .returning();
  res.status(201).json(inserted.map(serializeChecklistItem));
});

router.post("/me/trips/:tripId/checklist/items", requireRoles("traveler"), validate(TripChecklistItemInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { title } = req.body;

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  const [item] = await db
    .insert(tripChecklistItemsTable)
    .values({ tripId, userId, title, origin: "personal" })
    .returning();
  res.status(201).json(serializeChecklistItem(item));
});

router.patch("/me/trips/:tripId/checklist/items/:itemId", requireRoles("traveler"), validate(TripChecklistItemUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const itemId = parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10);
  const { completed } = req.body;
  const [item] = await db
    .update(tripChecklistItemsTable)
    .set({ completed, completedAt: completed ? new Date() : null })
    .where(and(
      eq(tripChecklistItemsTable.id, itemId),
      eq(tripChecklistItemsTable.tripId, tripId),
      eq(tripChecklistItemsTable.userId, userId),
    ))
    .returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeChecklistItem(item));
});

router.delete("/me/trips/:tripId/checklist/items/:itemId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const itemId = parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10);

  const [existing] = await db
    .select()
    .from(tripChecklistItemsTable)
    .where(and(
      eq(tripChecklistItemsTable.id, itemId),
      eq(tripChecklistItemsTable.tripId, tripId),
      eq(tripChecklistItemsTable.userId, userId),
    ));

  if (!existing) {
    res.sendStatus(204);
    return;
  }

  if (existing.origin === "agency") {
    res.status(403).json({ error: "Esta tarea fue definida por tu agencia y no se puede eliminar." });
    return;
  }

  await db
    .delete(tripChecklistItemsTable)
    .where(and(
      eq(tripChecklistItemsTable.id, itemId),
      eq(tripChecklistItemsTable.tripId, tripId),
      eq(tripChecklistItemsTable.userId, userId),
    ));
  res.sendStatus(204);
});

function serializePackingItem(i: typeof tripPackingItemsTable.$inferSelect) {
  return {
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

// Lazily generates the packing list for a trip the first time it's requested, based on
// trip duration, start month, and the categories of activities already scheduled in the
// itinerary. Generating on read (rather than at invitation/join time) guarantees the list
// exists for every access path — owner, invited traveler, or accepted share — without
// needing a trigger in each of those separate routes.
async function ensurePackingListGenerated(tripId: number, userId: number): Promise<void> {
  const existing = await db
    .select({ id: tripPackingItemsTable.id })
    .from(tripPackingItemsTable)
    .where(and(eq(tripPackingItemsTable.tripId, tripId), eq(tripPackingItemsTable.userId, userId)));
  if (existing.length > 0) return;

  const [trip] = await db
    .select({ startDate: tripsTable.startDate, endDate: tripsTable.endDate })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  if (!trip) return;

  const days = await db.select({ id: tripDaysTable.id }).from(tripDaysTable).where(eq(tripDaysTable.tripId, tripId));
  const durationDays = days.length > 0
    ? days.length
    : (trip.endDate
        ? Math.max(1, Math.round((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000) + 1)
        : 1);

  const dayIds = days.map(d => d.id);
  const activityCategories: string[] = dayIds.length > 0
    ? (await db
        .selectDistinct({ category: activitiesTable.category })
        .from(tripDayActivitiesTable)
        .innerJoin(activitiesTable, eq(tripDayActivitiesTable.activityId, activitiesTable.id))
        .where(inArray(tripDayActivitiesTable.dayId, dayIds)))
        .map(r => r.category)
        .filter((c): c is NonNullable<typeof c> => !!c)
    : [];

  const generated = generatePackingList({ durationDays, startDate: trip.startDate, activityCategories });
  if (generated.length === 0) return;

  await db.insert(tripPackingItemsTable).values(
    generated.map(item => ({ tripId, userId, title: item.title, category: item.category, origin: "suggested" as const })),
  );
}

router.get("/me/trips/:tripId/packing-list", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  await ensurePackingListGenerated(tripId, userId);

  const items = await db
    .select()
    .from(tripPackingItemsTable)
    .where(and(eq(tripPackingItemsTable.tripId, tripId), eq(tripPackingItemsTable.userId, userId)))
    .orderBy(tripPackingItemsTable.createdAt);
  res.json(items.map(serializePackingItem));
});

router.post("/me/trips/:tripId/packing-list/items", requireRoles("traveler"), validate(TripPackingItemInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { title, category } = req.body;

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  const [item] = await db
    .insert(tripPackingItemsTable)
    .values({ tripId, userId, title, category, origin: "personal" })
    .returning();
  res.status(201).json(serializePackingItem(item));
});

router.patch("/me/trips/:tripId/packing-list/items/:itemId", requireRoles("traveler"), validate(TripPackingItemUpdateSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const itemId = parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10);
  const { packed } = req.body;
  const [item] = await db
    .update(tripPackingItemsTable)
    .set({ packed })
    .where(and(
      eq(tripPackingItemsTable.id, itemId),
      eq(tripPackingItemsTable.tripId, tripId),
      eq(tripPackingItemsTable.userId, userId),
    ))
    .returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializePackingItem(item));
});

router.delete("/me/trips/:tripId/packing-list/items/:itemId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const itemId = parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10);
  await db
    .delete(tripPackingItemsTable)
    .where(and(
      eq(tripPackingItemsTable.id, itemId),
      eq(tripPackingItemsTable.tripId, tripId),
      eq(tripPackingItemsTable.userId, userId),
    ));
  res.sendStatus(204);
});

router.get("/me/trips/:tripId/travel-advisories", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  const countries = await getTripCountries(tripId);
  if (countries.length === 0) { res.json({ international: false, advisories: [] }); return; }

  await Promise.all(countries.map(c => ensureCountryAdvisoryFresh(c)));

  const rows = await db
    .select()
    .from(countryAdvisoriesTable)
    .where(inArray(countryAdvisoriesTable.countryName, countries));
  const rowByCountry = new Map(rows.map(r => [r.countryName, r]));

  const views = await db
    .select()
    .from(tripAdvisoryViewsTable)
    .where(and(eq(tripAdvisoryViewsTable.tripId, tripId), eq(tripAdvisoryViewsTable.userId, userId)));
  const viewByCountry = new Map(views.map(v => [v.countryName, v]));

  const advisories = countries.map(countryName => {
    const row = rowByCountry.get(countryName);
    const view = viewByCountry.get(countryName);
    const changed = !!row?.contentHash && view !== undefined && view.seenHash !== row.contentHash;
    return {
      countryName,
      sourceUrl: row?.sourceUrl ?? buildAdvisoryUrl(countryName),
      contentText: row?.contentText ?? null,
      officialUpdatedAt: row?.officialUpdatedAt ?? null,
      lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
      lastChangedAt: row?.lastChangedAt?.toISOString() ?? null,
      changed,
    };
  });

  for (const row of rows) {
    await db
      .insert(tripAdvisoryViewsTable)
      .values({ tripId, userId, countryName: row.countryName, seenHash: row.contentHash })
      .onConflictDoUpdate({
        target: [tripAdvisoryViewsTable.tripId, tripAdvisoryViewsTable.userId, tripAdvisoryViewsTable.countryName],
        set: { seenHash: row.contentHash, seenAt: new Date() },
      });
  }

  res.json({ international: true, advisories });
});

// ─── Países del viaje aún sin clasificar (para el modal al crear/unirse) ────
router.get("/me/trips/:tripId/countries", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await getTripChecklistAccess(tripId, userId);
  if (access === false) { res.status(403).json({ error: "Forbidden" }); return; }

  const [trip] = await db
    .select({ itineraryId: tripsTable.itineraryId })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));

  const countryNames = new Set<string>();

  const dayCountryRows = await db
    .selectDistinct({ cityFromCountry: tripDaysTable.cityFromCountry, cityToCountry: tripDaysTable.cityToCountry })
    .from(tripDaysTable)
    .where(eq(tripDaysTable.tripId, tripId));
  for (const r of dayCountryRows) {
    if (r.cityFromCountry) countryNames.add(r.cityFromCountry);
    if (r.cityToCountry) countryNames.add(r.cityToCountry);
  }

  if (trip?.itineraryId) {
    const [itin] = await db
      .select({ countries: itinerariesTable.countries })
      .from(itinerariesTable)
      .where(eq(itinerariesTable.id, trip.itineraryId));
    if (itin?.countries) for (const c of itin.countries) countryNames.add(c);
  }

  const alreadyClassified = new Set(
    (await db
      .select({ countryCode: userCountriesTable.countryCode })
      .from(userCountriesTable)
      .where(eq(userCountriesTable.userId, userId))
    ).map(r => r.countryCode),
  );

  const countries = Array.from(countryNames)
    .filter(Boolean)
    .map(name => ({ countryCode: COUNTRY_CODE_BY_NAME[name], countryName: name }))
    .filter((c): c is { countryCode: string; countryName: string } => !!c.countryCode && !alreadyClassified.has(c.countryCode))
    .sort((a, b) => a.countryName.localeCompare(b.countryName, "es"));

  res.json(countries);
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
  const { email } = req.body;
  const memberType: "member" | "guest" = req.body.memberType === "member" ? "member" : "guest";
  // A guest is always view-only (task #141 Miembro/Invitado); a member defaults to
  // full edit access but can still be shared as view-only if explicitly requested.
  const permission: "full" | "read" = memberType === "guest" ? "read" : (req.body.permission === "read" ? "read" : "full");

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

  // task #161: no manual accept step. A recipient who already has an account is linked
  // instantly; a cold email gets a single-use token that expires in 7 days and is
  // resolved automatically once they verify their new account.
  const [share] = await db.insert(tripSharesTable).values({
    tripId,
    ownerId: userId,
    sharedWithEmail: email.toLowerCase(),
    sharedWithUserId: recipient?.id ?? null,
    inviteToken: makeInviteToken(),
    tokenExpiresAt: recipient ? null : new Date(Date.now() + COLD_INVITE_TOKEN_TTL_MS),
    permission,
    memberType,
    status: recipient ? "accepted" : "pending",
    acceptedAt: recipient ? new Date() : null,
  }).returning();

  res.status(201).json({ ...share, createdAt: share.createdAt.toISOString() });

  if (recipient) {
    if (memberType === "member") {
      await ensureTripClassificationByDates(recipient.id, tripId);
      await backfillSharedWithAll(tripId, recipient.id);
    } else {
      await ensureTripClassification(recipient.id, tripId, "compartido");
    }
  }

  const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  const [trip] = await db.select({ name: tripsTable.name }).from(tripsTable).where(eq(tripsTable.id, tripId));
  if (owner && trip) {
    sendTripShareInvitationEmail({
      to: share.sharedWithEmail,
      ownerName: owner.name,
      tripName: trip.name,
      ctaText: recipient ? "Iniciar sesión" : "Crear mi cuenta",
      // Wouter uses plain paths, not hash-routing — no "/#/" prefix (see TESTING.md for
      // the 2026-07-30 bug where this landed on a blank page for every recipient).
      ctaUrl: `${PUBLIC_APP_URL}/${recipient ? "login" : `register?email=${encodeURIComponent(share.sharedWithEmail)}`}`,
      tripId,
    }).catch((err) => req.log.error({ err }, "Failed to send trip share invitation email"));
  }
});

// ─── Update share permission / member-type ────────────────────────────────────
router.patch("/me/trips/:tripId/shares/:shareId", requireRoles("traveler"), validate(UpdateShareInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const shareId = parseInt(Array.isArray(req.params.shareId) ? req.params.shareId[0] : req.params.shareId, 10);

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  const [existing] = await db.select().from(tripSharesTable)
    .where(and(eq(tripSharesTable.id, shareId), eq(tripSharesTable.tripId, tripId)));
  if (!existing) { res.status(404).json({ error: "Share not found" }); return; }

  const newMemberType: "member" | "guest" = req.body.memberType ?? existing.memberType;
  // A guest is always view-only; switching an existing guest to member defaults to
  // full access unless the caller explicitly asks to keep it view-only (task #141).
  const newPermission: "full" | "read" = newMemberType === "guest"
    ? "read"
    : (req.body.permission ?? (existing.memberType === "guest" ? "full" : existing.permission));

  const [updated] = await db
    .update(tripSharesTable)
    .set({ permission: newPermission, memberType: newMemberType })
    .where(and(eq(tripSharesTable.id, shareId), eq(tripSharesTable.tripId, tripId)))
    .returning();

  // Reclassify the recipient if their member-type actually changed after acceptance —
  // the only relationship a non-owner has to a personal trip is this share, so this is
  // a deliberate, safe classification change (task #141).
  if (updated.status === "accepted" && updated.sharedWithUserId && existing.memberType !== newMemberType) {
    if (newMemberType === "member") {
      await ensureTripClassificationByDates(updated.sharedWithUserId, tripId);
    } else {
      await setTripClassification(updated.sharedWithUserId, tripId, "compartido");
    }
  }

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
  // Make sure trip_days is materialized (lazy-copied from the itinerary template)
  // before inserting, so new rows aren't split across two different day tables.
  if (itineraryId) await copyItineraryDaysToTrip(tripId, itineraryId, userId);

  const { dayNumber, cityFrom, cityTo, cityFromCountry, cityToCountry, transport, description, isTransitNight } = req.body;

  const [fromGeo, toGeo] = await Promise.all([geocodeCity(cityFrom, cityFromCountry), geocodeCity(cityTo, cityToCountry)]);

  const [day] = await db
    .insert(tripDaysTable)
    .values({
      tripId,
      dayNumber,
      cityFrom: cityFrom ?? null,
      cityTo: cityTo ?? null,
      cityFromCountry: cityFromCountry ?? null,
      cityToCountry: cityToCountry ?? null,
      transport: transport ?? null,
      description: description ?? null,
      cityFromLat: fromGeo?.lat ?? null,
      cityFromLng: fromGeo?.lng ?? null,
      cityToLat: toGeo?.lat ?? null,
      cityToLng: toGeo?.lng ?? null,
      ...(isTransitNight !== undefined ? { isTransitNight } : {}),
    })
    .returning();

  res.status(201).json({
    id: day.id,
    tripId,
    dayNumber: day.dayNumber,
    cityFrom: day.cityFrom ?? null,
    cityTo: day.cityTo ?? null,
    cityFromCountry: day.cityFromCountry ?? null,
    cityToCountry: day.cityToCountry ?? null,
    transport: day.transport ?? null,
    description: day.description ?? null,
    isTransitNight: day.isTransitNight,
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
  // Lazy-migrate itinerary_days → trip_days first, so we're editing the row that
  // GET /me/trips/:tripId and the rest of the traveler UI actually reads from.
  if (itineraryId) await copyItineraryDaysToTrip(tripId, itineraryId, userId);

  const { dayNumber, cityFrom, cityTo, cityFromCountry, cityToCountry, transport, description, isTransitNight, photoUrl } = req.body;

  const patch: Record<string, unknown> = {};
  if (cityFrom !== undefined) patch.cityFrom = cityFrom ?? null;
  if (cityTo !== undefined) patch.cityTo = cityTo ?? null;
  if (cityFromCountry !== undefined) patch.cityFromCountry = cityFromCountry ?? null;
  if (cityToCountry !== undefined) patch.cityToCountry = cityToCountry ?? null;
  if (transport !== undefined) patch.transport = transport ?? null;
  if (description !== undefined) patch.description = description ?? null;
  if (isTransitNight !== undefined) patch.isTransitNight = isTransitNight;
  if (photoUrl !== undefined) patch.photoUrl = photoUrl ?? null;

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

  if (!updated) { res.status(404).json({ error: "Día no encontrado" }); return; }

  const hotelMap = await getTravelerDayHotelMap([updated.id], "trip");

  res.json({
    id: updated.id,
    tripId,
    dayNumber: updated.dayNumber,
    cityFrom: updated.cityFrom ?? null,
    cityTo: updated.cityTo ?? null,
    cityFromCountry: updated.cityFromCountry ?? null,
    cityToCountry: updated.cityToCountry ?? null,
    transport: updated.transport ?? null,
    description: updated.description ?? null,
    isTransitNight: updated.isTransitNight,
    photoUrl: updated.photoUrl ?? null,
    hotels: hotelMap[updated.id] ?? [],
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/me/trips/:tripId/days/:dayId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);

  const itineraryId = await getTripEditAccess(tripId, userId);
  if (itineraryId === false) { res.status(403).json({ error: "No tienes permisos para editar este viaje" }); return; }
  if (itineraryId) await copyItineraryDaysToTrip(tripId, itineraryId, userId);

  await db.delete(tripDaysTable)
    .where(and(eq(tripDaysTable.id, dayId), eq(tripDaysTable.tripId, tripId)));

  res.sendStatus(204);
});

// ─── Leave a trip (remove own invitation or share) ───────────────────────────
router.delete("/me/trips/:tripId/leave", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const [meRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = meRow?.email ?? "";

  // Remove accepted share (agency invite or #141 personal share)
  await db.delete(tripSharesTable).where(and(
    eq(tripSharesTable.tripId, tripId),
    or(
      eq(tripSharesTable.sharedWithUserId, userId),
      eq(tripSharesTable.sharedWithEmail, myEmail),
    ),
    eq(tripSharesTable.status, "accepted"),
  ));

  await db.delete(tripClassificationsTable).where(and(
    eq(tripClassificationsTable.userId, userId),
    eq(tripClassificationsTable.tripId, tripId),
  ));

  res.sendStatus(204);
});

// ─── Dismiss a cancelled trip from the traveler's view ───────────────────────
router.delete("/me/trips/:tripId/dismiss", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const [meRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = meRow?.email ?? "";

  // Remove share (any status)
  await db.delete(tripSharesTable).where(and(
    eq(tripSharesTable.tripId, tripId),
    or(
      eq(tripSharesTable.sharedWithUserId, userId),
      eq(tripSharesTable.sharedWithEmail, myEmail),
    ),
  ));

  await db.delete(tripClassificationsTable).where(and(
    eq(tripClassificationsTable.userId, userId),
    eq(tripClassificationsTable.tripId, tripId),
  ));

  res.sendStatus(204);
});

// ─── Trip photo shares: frozen snapshot for an external contact without an
// account ("Invitada", task #141) ─────────────────────────────────────────────

function buildTripPhotoSnapshotDay(
  day: typeof tripDaysTable.$inferSelect,
  hotels: ReturnType<typeof serializeDayHotel>[],
  activities: Array<{ activityName: string; notes: string | null; startTime: string | null; endTime: string | null }>,
): TripPhotoSnapshotDay {
  return {
    dayNumber: day.dayNumber,
    cityFrom: day.cityFrom ?? null,
    cityTo: day.cityTo ?? null,
    hotels: hotels.map(h => ({ name: h.hotelName, address: h.hotelAddress, phone: h.hotelPhone, website: h.hotelWebsite })),
    activities: activities.map(a => ({ name: a.activityName, description: a.notes, startTime: a.startTime, endTime: a.endTime })),
  };
}

async function buildTripPhotoSnapshot(tripId: number, creatorUserId: number): Promise<TripPhotoSnapshot | null> {
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) return null;

  let tripDayRows = await db.select().from(tripDaysTable).where(eq(tripDaysTable.tripId, tripId)).orderBy(tripDaysTable.dayNumber);
  if (tripDayRows.length === 0 && trip.itineraryId) {
    tripDayRows = await copyItineraryDaysToTrip(tripId, trip.itineraryId, creatorUserId);
  }

  const [hotelMap, activityMap] = await Promise.all([
    getTravelerDayHotelMap(tripDayRows.map(d => d.id), "trip"),
    // #151: scope the snapshot to what the sharer themself can see -- their own included
    // activities plus por-libre activities they created or participate in, never anyone else's.
    getTripDayActivityMap(tripDayRows.map(d => d.id), creatorUserId, trip.ownerId),
  ]);
  await mergeItineraryFallbacks(trip.itineraryId, tripDayRows, hotelMap, activityMap);

  return {
    tripName: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate ?? null,
    description: trip.description ?? null,
    days: tripDayRows.map(d => buildTripPhotoSnapshotDay(d, hotelMap[d.id] ?? [], activityMap[d.id] ?? [])),
  };
}

// A materialized template trip is always personal (no agency involved), so hotels
// and activities are resolved against the same agencyId:null "free entry" catalog
// travelers already use for their own personal trips (#32) — find-or-create by name.
async function findOrCreatePersonalHotel(name: string, city: string | null): Promise<number> {
  const [existing] = await db.select({ id: hotelsTable.id }).from(hotelsTable)
    .where(and(eq(hotelsTable.name, name), sql`${hotelsTable.agencyId} IS NULL`));
  if (existing) return existing.id;
  const [created] = await db.insert(hotelsTable).values({ name, city: city ?? "", country: "" }).returning({ id: hotelsTable.id });
  return created.id;
}

async function findOrCreatePersonalActivity(name: string): Promise<number> {
  const [existing] = await db.select({ id: activitiesTable.id }).from(activitiesTable)
    .where(and(eq(activitiesTable.name, name), sql`${activitiesTable.agencyId} IS NULL`));
  if (existing) return existing.id;
  const [created] = await db.insert(activitiesTable).values({ name }).returning({ id: activitiesTable.id });
  return created.id;
}

async function materializeTripFromSnapshot(snapshot: TripPhotoSnapshot, userId: number): Promise<number> {
  const [trip] = await db.insert(tripsTable).values({
    name: snapshot.tripName,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    description: snapshot.description,
    ownerId: userId,
    status: "draft",
  }).returning();

  for (const day of snapshot.days) {
    const [tripDay] = await db.insert(tripDaysTable).values({
      tripId: trip.id,
      dayNumber: day.dayNumber,
      cityFrom: day.cityFrom,
      cityTo: day.cityTo,
    }).returning();

    for (const hotel of day.hotels) {
      const hotelId = await findOrCreatePersonalHotel(hotel.name, day.cityTo ?? day.cityFrom);
      await db.insert(tripDayHotelsTable).values({ tripDayId: tripDay.id, hotelId });
    }
    for (const activity of day.activities) {
      const activityId = await findOrCreatePersonalActivity(activity.name);
      await db.insert(tripDayActivitiesTable).values({
        dayId: tripDay.id, activityId, sortOrder: 0,
        startTime: activity.startTime, notes: activity.description, createdByUserId: userId,
      });
    }
  }

  return trip.id;
}

// ─── Generate a photo share for a trip I own/manage ──────────────────────────
router.post("/me/trips/:tripId/photo-shares", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  const snapshot = await buildTripPhotoSnapshot(tripId, userId);
  if (!snapshot) { res.status(404).json({ error: "Trip not found" }); return; }

  const shareCode = makeShareCode();
  const [photoShare] = await db.insert(tripPhotoSharesTable).values({ tripId, ownerId: userId, shareCode, snapshot }).returning();

  res.status(201).json({ id: photoShare.id, shareCode: photoShare.shareCode, createdAt: photoShare.createdAt.toISOString() });
});

// ─── List / revoke photo shares for a trip I own/manage ──────────────────────
router.get("/me/trips/:tripId/photo-shares", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  const shares = await db
    .select({ id: tripPhotoSharesTable.id, shareCode: tripPhotoSharesTable.shareCode, createdAt: tripPhotoSharesTable.createdAt })
    .from(tripPhotoSharesTable)
    .where(eq(tripPhotoSharesTable.tripId, tripId));
  res.json(shares.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.delete("/me/trips/:tripId/photo-shares/:photoShareId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const photoShareId = parseInt(Array.isArray(req.params.photoShareId) ? req.params.photoShareId[0] : req.params.photoShareId, 10);

  if (!(await canManageShares(tripId, userId))) { res.status(403).json({ error: "Not your trip" }); return; }

  await db.delete(tripPhotoSharesTable).where(and(eq(tripPhotoSharesTable.id, photoShareId), eq(tripPhotoSharesTable.tripId, tripId)));
  res.sendStatus(204);
});

// ─── Public: view a shared photo (no auth — accessible via link/code) ────────
router.get("/trip-photos/:code", async (req, res): Promise<void> => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [photoShare] = await db.select().from(tripPhotoSharesTable).where(eq(tripPhotoSharesTable.shareCode, code));
  if (!photoShare) { res.status(404).json({ error: "Foto no encontrada" }); return; }
  res.json({ shareCode: photoShare.shareCode, snapshot: photoShare.snapshot });
});

// ─── Use a shared photo as a template for a brand new, editable personal trip ─
// Classified "compartido" by default (task #140 decisions) since it doesn't come
// from official agency membership.
router.post("/trip-photos/:code/use-as-template", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [photoShare] = await db.select().from(tripPhotoSharesTable).where(eq(tripPhotoSharesTable.shareCode, code));
  if (!photoShare) { res.status(404).json({ error: "Foto no encontrada" }); return; }

  const newTripId = await materializeTripFromSnapshot(photoShare.snapshot, userId);
  await ensureTripClassification(userId, newTripId, "compartido");

  res.status(201).json({ tripId: newTripId });
});

// Copy the trip_notes a traveler can see on the original trip (their own + ones explicitly
// shared with them via trip_note_shares, same visibility rule as GET /me/trips/:tripId/notes)
// into the newly materialized trip, as new independent notes owned by that traveler.
async function copyVisibleTripNotes(tripId: number, newTripId: number, userId: number): Promise<void> {
  const notes = await db
    .select({
      dayNumber: tripNotesTable.dayNumber,
      endDayNumber: tripNotesTable.endDayNumber,
      content: tripNotesTable.content,
    })
    .from(tripNotesTable)
    .leftJoin(usersTable, eq(usersTable.id, tripNotesTable.userId))
    .where(and(
      eq(tripNotesTable.tripId, tripId),
      or(
        inArray(usersTable.role, ["admin", "manager", "agent"]),
        eq(tripNotesTable.userId, userId),
        sql`EXISTS(SELECT 1 FROM trip_note_shares s WHERE s.note_id = ${tripNotesTable.id} AND s.traveler_id = ${userId})`,
      ),
    ));

  if (notes.length === 0) return;
  await db.insert(tripNotesTable).values(
    notes.map(n => ({ tripId: newTripId, userId, dayNumber: n.dayNumber, endDayNumber: n.endDayNumber, content: n.content })),
  );
}

// ─── Use a trip shared with me (via trip_shares) as a template for my own trip ─
// #152: an Invitado ("crear un viaje nuevo") or Miembro ("duplicar viaje") with an accepted
// share can copy the trip they can see into an independent trip of their own. Reuses the same
// snapshot/materialize logic as the photo-share flow above (#141) instead of a second copier.
// Classified "compartido" like #141 regardless of memberType.
router.post("/me/trips/:tripId/use-as-template", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  // Only meaningful for an accepted personal (#141) trip_shares row (member or guest) --
  // owners/staff/agency-invited travelers already have their own real trip, nothing to
  // copy here (task #161: agency invites now live in the same table, distinguished by origin).
  if (!access.authorized || !access.memberType || access.origin !== "traveler") {
    res.status(403).json({ error: "Not a shared trip for this traveler" }); return;
  }

  const snapshot = await buildTripPhotoSnapshot(tripId, userId);
  if (!snapshot) { res.status(404).json({ error: "Trip not found" }); return; }

  const newTripId = await materializeTripFromSnapshot(snapshot, userId);
  await copyVisibleTripNotes(tripId, newTripId, userId);
  await ensureTripClassification(userId, newTripId, "compartido");

  res.status(201).json({ tripId: newTripId });
});

// ─── Trip Documents ───────────────────────────────────────────────────────────
// Visibility (#153): agency-authored docs are visible to every trip member; a traveler's own
// upload is visible only to its creator plus whoever it's been explicitly shared with via
// trip_document_shares. Always resolved here in the backend query, never filtered client-side.
router.get("/me/trips/:tripId/documents", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }

  const docs = await db
    .select({
      id: tripDocumentsTable.id,
      tripId: tripDocumentsTable.tripId,
      userId: tripDocumentsTable.userId,
      filename: tripDocumentsTable.filename,
      mimeType: tripDocumentsTable.mimeType,
      storageKey: tripDocumentsTable.storageKey,
      sharedWithAll: tripDocumentsTable.sharedWithAll,
      createdAt: tripDocumentsTable.createdAt,
      uploaderRole: usersTable.role,
    })
    .from(tripDocumentsTable)
    .leftJoin(usersTable, eq(usersTable.id, tripDocumentsTable.userId))
    .where(and(
      eq(tripDocumentsTable.tripId, tripId),
      or(
        inArray(usersTable.role, ["admin", "manager", "agent"]),
        eq(tripDocumentsTable.userId, userId),
        sql`EXISTS(SELECT 1 FROM trip_document_shares s WHERE s.document_id = ${tripDocumentsTable.id} AND s.traveler_id = ${userId})`,
      ),
    ))
    .orderBy(tripDocumentsTable.createdAt);

  const myDocIds = docs.filter(d => d.userId === userId).map(d => d.id);
  const shareRows = myDocIds.length > 0
    ? await db
        .select({ documentId: tripDocumentSharesTable.documentId, id: usersTable.id, name: usersTable.name })
        .from(tripDocumentSharesTable)
        .innerJoin(usersTable, eq(usersTable.id, tripDocumentSharesTable.travelerId))
        .where(inArray(tripDocumentSharesTable.documentId, myDocIds))
    : [];
  const sharedWithByDoc: Record<number, { id: number; name: string | null }[]> = {};
  for (const s of shareRows) (sharedWithByDoc[s.documentId] ??= []).push({ id: s.id, name: s.name });

  res.json(docs.map(d => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
    uploaderRole: d.uploaderRole ?? "traveler",
    sharedWith: d.userId === userId ? (sharedWithByDoc[d.id] ?? []) : undefined,
    sharedWithAll: d.userId === userId ? d.sharedWithAll : undefined,
  })));
});

router.post("/me/trips/:tripId/documents", requireRoles("traveler"), validate(TripDocumentInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  if (access.memberType === "guest") {
    res.status(403).json({ error: "Los invitados no pueden crear documentos propios" }); return;
  }

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
  res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString(), uploaderRole: "traveler", sharedWith: [] });
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

// Creator adds recipients to their own document. Recipients must be trip members with member
// access (not guests) -- validated against the same listTripMembers used by the #151 participant
// picker rather than the agency invitation table.
router.post("/me/trips/:tripId/documents/:documentId/shares", requireRoles("traveler"), validate(TripResourceSharesInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);
  const { travelerIds, shareWithAll } = req.body as { travelerIds: number[]; shareWithAll?: boolean };

  const [doc] = await db
    .select()
    .from(tripDocumentsTable)
    .where(and(eq(tripDocumentsTable.id, documentId), eq(tripDocumentsTable.tripId, tripId), eq(tripDocumentsTable.userId, userId)));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const members = await listTripMembers(tripId);
  const memberIds = new Set(members.map(m => m.id));
  const validTravelerIds = travelerIds.filter(id => memberIds.has(id) && id !== userId);
  if (validTravelerIds.length === 0) { res.status(400).json({ error: "Ningún viajero válido para compartir" }); return; }

  await db.insert(tripDocumentSharesTable)
    .values(validTravelerIds.map(travelerId => ({ documentId, travelerId })))
    .onConflictDoNothing();

  // "Compartir con todos" (shareWithAll): future joiners get backfilled a share row too, see
  // backfillSharedWithAll -- not just whoever happened to be a trip member at click time.
  if (shareWithAll) {
    await db.update(tripDocumentsTable).set({ sharedWithAll: true }).where(eq(tripDocumentsTable.id, documentId));
  }

  const shareRows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(tripDocumentSharesTable)
    .innerJoin(usersTable, eq(usersTable.id, tripDocumentSharesTable.travelerId))
    .where(eq(tripDocumentSharesTable.documentId, documentId));
  res.status(201).json({ sharedWith: shareRows, sharedWithAll: !!shareWithAll || doc.sharedWithAll });
});

// Removes a recipient. The creator can remove anyone; a recipient can remove themselves (leave).
// The creator can re-add them afterwards -- leaving is not a block, see #153 scope decisions.
router.delete("/me/trips/:tripId/documents/:documentId/shares/:travelerId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);
  const travelerId = parseInt(Array.isArray(req.params.travelerId) ? req.params.travelerId[0] : req.params.travelerId, 10);

  const [doc] = await db.select().from(tripDocumentsTable).where(eq(tripDocumentsTable.id, documentId));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const isCreator = doc.userId === userId;
  const isSelfRemoval = travelerId === userId;
  if (!isCreator && !isSelfRemoval) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(tripDocumentSharesTable).where(and(
    eq(tripDocumentSharesTable.documentId, documentId),
    eq(tripDocumentSharesTable.travelerId, travelerId),
  ));
  res.sendStatus(204);
});

// ─── Get signed download URL for a trip document ─────────────────────────────
router.get("/me/trips/:tripId/documents/:documentId/download", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);

  const [doc] = await db
    .select({
      id: tripDocumentsTable.id, tripId: tripDocumentsTable.tripId, userId: tripDocumentsTable.userId,
      storageKey: tripDocumentsTable.storageKey, uploaderRole: usersTable.role,
    })
    .from(tripDocumentsTable)
    .leftJoin(usersTable, eq(usersTable.id, tripDocumentsTable.userId))
    .where(and(eq(tripDocumentsTable.id, documentId), eq(tripDocumentsTable.tripId, tripId)));

  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }

  const isAgencyDoc = doc.uploaderRole ? AGENCY_STAFF_ROLES.has(doc.uploaderRole) : false;
  const isCreator = doc.userId === userId;
  let isRecipient = false;
  if (!isAgencyDoc && !isCreator) {
    const [share] = await db
      .select({ id: tripDocumentSharesTable.id })
      .from(tripDocumentSharesTable)
      .where(and(eq(tripDocumentSharesTable.documentId, documentId), eq(tripDocumentSharesTable.travelerId, userId)));
    isRecipient = !!share;
  }
  if (!isAgencyDoc && !isCreator && !isRecipient) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    const signedUrl = await objectStorage.getSignedDownloadUrl(doc.storageKey, 900);
    res.json({ signedUrl });
  } catch (err) {
    req.log.error({ err }, "Error generating signed download URL");
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

// ─── Trip Links ("Enlaces") ────────────────────────────────────────────────────
// Independent feature reusing trip_documents' ownership/visibility pattern exactly (#153):
// agency-authored links are visible to every trip member; a traveler's own link is visible only
// to its creator plus whoever it's been explicitly shared with via trip_link_shares. Always
// resolved here in the backend query, never filtered client-side.
router.get("/me/trips/:tripId/links", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }

  const links = await db
    .select({
      id: tripLinksTable.id,
      tripId: tripLinksTable.tripId,
      userId: tripLinksTable.userId,
      title: tripLinksTable.title,
      url: tripLinksTable.url,
      sharedWithAll: tripLinksTable.sharedWithAll,
      createdAt: tripLinksTable.createdAt,
      uploaderRole: usersTable.role,
    })
    .from(tripLinksTable)
    .leftJoin(usersTable, eq(usersTable.id, tripLinksTable.userId))
    .where(and(
      eq(tripLinksTable.tripId, tripId),
      or(
        inArray(usersTable.role, ["admin", "manager", "agent"]),
        eq(tripLinksTable.userId, userId),
        sql`EXISTS(SELECT 1 FROM trip_link_shares s WHERE s.link_id = ${tripLinksTable.id} AND s.traveler_id = ${userId})`,
      ),
    ))
    .orderBy(tripLinksTable.createdAt);

  const myLinkIds = links.filter(l => l.userId === userId).map(l => l.id);
  const shareRows = myLinkIds.length > 0
    ? await db
        .select({ linkId: tripLinkSharesTable.linkId, id: usersTable.id, name: usersTable.name })
        .from(tripLinkSharesTable)
        .innerJoin(usersTable, eq(usersTable.id, tripLinkSharesTable.travelerId))
        .where(inArray(tripLinkSharesTable.linkId, myLinkIds))
    : [];
  const sharedWithByLink: Record<number, { id: number; name: string | null }[]> = {};
  for (const s of shareRows) (sharedWithByLink[s.linkId] ??= []).push({ id: s.id, name: s.name });

  res.json(links.map(l => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
    uploaderRole: l.uploaderRole ?? "traveler",
    sharedWith: l.userId === userId ? (sharedWithByLink[l.id] ?? []) : undefined,
    sharedWithAll: l.userId === userId ? l.sharedWithAll : undefined,
  })));
});

router.post("/me/trips/:tripId/links", requireRoles("traveler"), validate(TripLinkInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const access = await verifyTripAccessCore(tripId, userId, req.session.agencyId, req.session.role);
  if (!access.authorized) { res.status(403).json({ error: access.reason }); return; }
  if (access.memberType === "guest") {
    res.status(403).json({ error: "Los invitados no pueden crear enlaces propios" }); return;
  }

  const { title, url } = req.body as { title: string; url: string };

  const [link] = await db
    .insert(tripLinksTable)
    .values({ tripId, userId, title, url })
    .returning();
  res.status(201).json({ ...link, createdAt: link.createdAt.toISOString(), uploaderRole: "traveler", sharedWith: [] });
});

router.delete("/me/trips/:tripId/links/:linkId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);

  const [link] = await db
    .select()
    .from(tripLinksTable)
    .where(and(eq(tripLinksTable.id, linkId), eq(tripLinksTable.userId, userId)));

  if (!link) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(tripLinksTable).where(eq(tripLinksTable.id, linkId));
  res.sendStatus(204);
});

// Creator adds recipients to their own link. Recipients must be trip members with member
// access (not guests) -- validated against the same listTripMembers used by the #151 participant
// picker rather than the agency invitation table.
router.post("/me/trips/:tripId/links/:linkId/shares", requireRoles("traveler"), validate(TripResourceSharesInputSchema), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const { travelerIds, shareWithAll } = req.body as { travelerIds: number[]; shareWithAll?: boolean };

  const [link] = await db
    .select()
    .from(tripLinksTable)
    .where(and(eq(tripLinksTable.id, linkId), eq(tripLinksTable.tripId, tripId), eq(tripLinksTable.userId, userId)));
  if (!link) { res.status(404).json({ error: "Not found" }); return; }

  const members = await listTripMembers(tripId);
  const memberIds = new Set(members.map(m => m.id));
  const validTravelerIds = travelerIds.filter(id => memberIds.has(id) && id !== userId);
  if (validTravelerIds.length === 0) { res.status(400).json({ error: "Ningún viajero válido para compartir" }); return; }

  await db.insert(tripLinkSharesTable)
    .values(validTravelerIds.map(travelerId => ({ linkId, travelerId })))
    .onConflictDoNothing();

  // "Compartir con todos" (shareWithAll): future joiners get backfilled a share row too, see
  // backfillSharedWithAll -- not just whoever happened to be a trip member at click time.
  if (shareWithAll) {
    await db.update(tripLinksTable).set({ sharedWithAll: true }).where(eq(tripLinksTable.id, linkId));
  }

  const shareRows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(tripLinkSharesTable)
    .innerJoin(usersTable, eq(usersTable.id, tripLinkSharesTable.travelerId))
    .where(eq(tripLinkSharesTable.linkId, linkId));
  res.status(201).json({ sharedWith: shareRows, sharedWithAll: !!shareWithAll || link.sharedWithAll });
});

// Removes a recipient. The creator can remove anyone; a recipient can remove themselves (leave),
// with no cost or side effect -- same "leave freely" semantics as documents/notes (#153).
router.delete("/me/trips/:tripId/links/:linkId/shares/:travelerId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const travelerId = parseInt(Array.isArray(req.params.travelerId) ? req.params.travelerId[0] : req.params.travelerId, 10);

  const [link] = await db.select().from(tripLinksTable).where(eq(tripLinksTable.id, linkId));
  if (!link) { res.status(404).json({ error: "Not found" }); return; }

  const isCreator = link.userId === userId;
  const isSelfRemoval = travelerId === userId;
  if (!isCreator && !isSelfRemoval) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(tripLinkSharesTable).where(and(
    eq(tripLinkSharesTable.linkId, linkId),
    eq(tripLinkSharesTable.travelerId, travelerId),
  ));
  res.sendStatus(204);
});

export default router;
