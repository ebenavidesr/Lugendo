import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  tripsTable, tripDaysTable, invitationsTable,
  agenciesTable, hotelsTable, tripNotesTable, itinerariesTable,
  itineraryDaysTable,
  tripSharesTable, usersTable,
} from "@workspace/db";
import { requireRoles } from "../middlewares/auth";

function makeShareCode(): string {
  return randomBytes(6).toString("base64url").toUpperCase();
}

const router: IRouter = Router();

// ─── List trips (agency-invited + own personal trips) ───────────────────────
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
      countries: row.countries ?? [],
      agencyName: row.agencyName ?? null,
      agencyLogoUrl: row.agencyLogoUrl ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }

  // Add personal trips
  for (const row of personalRows) {
    trips.push({
      ...row,
      isPersonal: true,
      agencyName: null,
      agencyLogoUrl: null,
      countries: [],
      createdAt: row.createdAt.toISOString(),
    });
  }

  // Sort by startDate desc
  trips.sort((a, b) => a.startDate < b.startDate ? 1 : -1);

  res.json(trips);
});

// ─── Create personal trip ────────────────────────────────────────────────────
router.post("/me/trips", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const {
    name, startDate, endDate,
    itineraryId, maxCapacity,
    airline, flightNumber, flightTime, reservationCode,
    returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode,
  } = req.body;

  if (!name || !startDate) {
    res.status(400).json({ error: "name y startDate son obligatorios" });
    return;
  }

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
    })
    .returning();

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

  const [acceptedShare] = await db
    .select({ id: tripSharesTable.id })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.tripId, tripId),
      eq(tripSharesTable.sharedWithUserId, userId),
      eq(tripSharesTable.status, "accepted"),
    ));

  if (!invite && !ownedTrip && !acceptedShare) { res.status(404).json({ error: "Not found" }); return; }

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

  let days: Array<{
    id: number; tripId: number; dayNumber: number;
    cityFrom: string | null; cityTo: string | null; transport: string | null;
    description: string | null; hotelId: number | null; hotelName: string | null;
    createdAt: Date;
  }> = await db
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
    .where(eq(tripDaysTable.tripId, tripId))
    .orderBy(tripDaysTable.dayNumber);

  // Personal trips store days in itinerary_days — fall back if trip_days is empty
  if (days.length === 0 && row.itineraryId) {
    const itinDays = await db
      .select({
        id: itineraryDaysTable.id,
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
      .where(eq(itineraryDaysTable.itineraryId, row.itineraryId))
      .orderBy(itineraryDaysTable.dayNumber);
    days = itinDays.map(d => ({ ...d, tripId }));
  }

  res.json({
    ...row,
    isPersonal: row.ownerId != null && row.agencyName == null,
    agencyName: row.agencyName ?? null,
    agencyLogoUrl: row.agencyLogoUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    days: days.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })),
  });
});

// ─── Update personal trip ─────────────────────────────────────────────────────
router.patch("/me/trips/:tripId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const [owned] = await db.select({ id: tripsTable.id, itineraryId: tripsTable.itineraryId })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  if (!owned) { res.status(403).json({ error: "No es tu viaje" }); return; }

  const {
    name, status, startDate, endDate,
    airline, flightNumber, flightTime, reservationCode,
    returnAirline, returnFlightNumber, returnFlightTime, returnReservationCode,
  } = req.body as Record<string, string | null | undefined>;

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

  let days: Array<{
    id: number; tripId: number; dayNumber: number;
    cityFrom: string | null; cityTo: string | null; transport: string | null;
    description: string | null; hotelId: number | null; hotelName: string | null;
    createdAt: Date;
  }> = await db
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
    .where(eq(tripDaysTable.tripId, tripId))
    .orderBy(tripDaysTable.dayNumber);

  if (days.length === 0 && updated.itineraryId) {
    const itinDays = await db
      .select({
        id: itineraryDaysTable.id,
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
      .where(eq(itineraryDaysTable.itineraryId, updated.itineraryId))
      .orderBy(itineraryDaysTable.dayNumber);
    days = itinDays.map(d => ({ ...d, tripId }));
  }

  res.json({
    ...updated,
    isPersonal: updated.ownerId != null && updated.agencyName == null,
    agencyName: updated.agencyName ?? null,
    agencyLogoUrl: updated.agencyLogoUrl ?? null,
    createdAt: updated.createdAt.toISOString(),
    days: days.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })),
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

router.post("/me/trips/:tripId/notes", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { content, dayNumber } = req.body;
  if (content == null) { res.status(400).json({ error: "content is required" }); return; }
  const [note] = await db
    .insert(tripNotesTable)
    .values({ tripId, userId, content, dayNumber })
    .returning();
  res.status(201).json({ ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString() });
});

router.patch("/me/trips/:tripId/notes/:noteId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { content } = req.body;
  if (content == null) { res.status(400).json({ error: "content is required" }); return; }
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

// ─── List shares for a trip I own ────────────────────────────────────────────
router.get("/me/trips/:tripId/shares", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const [owned] = await db.select({ id: tripsTable.id }).from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  if (!owned) { res.status(403).json({ error: "Not your trip" }); return; }

  const shares = await db.select().from(tripSharesTable).where(eq(tripSharesTable.tripId, tripId));
  res.json(shares.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

// ─── Share a trip ─────────────────────────────────────────────────────────────
router.post("/me/trips/:tripId/shares", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { email, permission = "read" } = req.body as { email: string; permission?: string };

  if (!email) { res.status(400).json({ error: "email is required" }); return; }

  const [owned] = await db.select({ id: tripsTable.id }).from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  if (!owned) { res.status(403).json({ error: "Not your trip" }); return; }

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

// ─── Revoke a share ───────────────────────────────────────────────────────────
router.delete("/me/trips/:tripId/shares/:shareId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const shareId = parseInt(Array.isArray(req.params.shareId) ? req.params.shareId[0] : req.params.shareId, 10);

  const [owned] = await db.select({ id: tripsTable.id }).from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  if (!owned) { res.status(403).json({ error: "Not your trip" }); return; }

  await db.delete(tripSharesTable).where(and(eq(tripSharesTable.id, shareId), eq(tripSharesTable.tripId, tripId)));
  res.sendStatus(204);
});

// ─── List trips shared WITH me ────────────────────────────────────────────────
router.get("/me/shared-trips", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const me = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const myEmail = me[0]?.email;

  const shares = await db.select().from(tripSharesTable)
    .where(
      eq(tripSharesTable.sharedWithEmail, myEmail ?? "")
    );

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

    if (row) {
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
  }

  res.json(result);
});

// ─── Accept a share by code ───────────────────────────────────────────────────
// ─── Trip Day management (personal trips) ────────────────────────────────────

async function getOwnedTripItineraryId(tripId: number, userId: number): Promise<number | null | false> {
  const [trip] = await db
    .select({ id: tripsTable.id, itineraryId: tripsTable.itineraryId })
    .from(tripsTable)
    .where(and(eq(tripsTable.id, tripId), eq(tripsTable.ownerId, userId)));
  if (!trip) return false;
  if (trip.itineraryId) return trip.itineraryId;
  // Auto-create itinerary if none exists
  const [itin] = await db
    .insert(itinerariesTable)
    .values({ name: "Mi itinerario", numDays: 0 })
    .returning();
  await db.update(tripsTable).set({ itineraryId: itin.id }).where(eq(tripsTable.id, tripId));
  return itin.id;
}

router.post("/me/trips/:tripId/days", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

  const itineraryId = await getOwnedTripItineraryId(tripId, userId);
  if (itineraryId === false) { res.status(403).json({ error: "No es tu viaje" }); return; }

  const { dayNumber, cityFrom, cityTo, transport, description, hotelId } = req.body as Record<string, unknown>;
  if (!dayNumber) { res.status(400).json({ error: "dayNumber es obligatorio" }); return; }

  const [day] = await db
    .insert(itineraryDaysTable)
    .values({
      itineraryId: itineraryId as number,
      dayNumber: Number(dayNumber),
      ...(cityFrom ? { cityFrom: String(cityFrom) } : {}),
      ...(cityTo ? { cityTo: String(cityTo) } : {}),
      ...(transport ? { transport: String(transport) } : {}),
      ...(description ? { description: String(description) } : {}),
      ...(hotelId ? { hotelId: Number(hotelId) } : {}),
    })
    .returning();

  const [hotel] = hotelId
    ? await db.select({ name: hotelsTable.name }).from(hotelsTable).where(eq(hotelsTable.id, Number(hotelId)))
    : [];

  res.status(201).json({
    id: day.id,
    tripId,
    dayNumber: day.dayNumber,
    cityFrom: day.cityFrom ?? null,
    cityTo: day.cityTo ?? null,
    transport: day.transport ?? null,
    description: day.description ?? null,
    hotelId: day.hotelId ?? null,
    hotelName: hotel?.name ?? null,
    createdAt: day.createdAt.toISOString(),
  });
});

router.patch("/me/trips/:tripId/days/:dayId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);

  const itineraryId = await getOwnedTripItineraryId(tripId, userId);
  if (itineraryId === false) { res.status(403).json({ error: "No es tu viaje" }); return; }

  const { dayNumber, cityFrom, cityTo, transport, description, hotelId } = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  if (dayNumber !== undefined) patch.dayNumber = Number(dayNumber);
  if (cityFrom !== undefined) patch.cityFrom = cityFrom || null;
  if (cityTo !== undefined) patch.cityTo = cityTo || null;
  if (transport !== undefined) patch.transport = transport || null;
  if (description !== undefined) patch.description = description || null;
  if (hotelId !== undefined) patch.hotelId = hotelId ? Number(hotelId) : null;

  const [updated] = await db
    .update(itineraryDaysTable)
    .set(patch)
    .where(and(eq(itineraryDaysTable.id, dayId), eq(itineraryDaysTable.itineraryId, itineraryId as number)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Día no encontrado" }); return; }

  const [hotel] = updated.hotelId
    ? await db.select({ name: hotelsTable.name }).from(hotelsTable).where(eq(hotelsTable.id, updated.hotelId))
    : [];

  res.json({
    id: updated.id,
    tripId,
    dayNumber: updated.dayNumber,
    cityFrom: updated.cityFrom ?? null,
    cityTo: updated.cityTo ?? null,
    transport: updated.transport ?? null,
    description: updated.description ?? null,
    hotelId: updated.hotelId ?? null,
    hotelName: hotel?.name ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/me/trips/:tripId/days/:dayId", requireRoles("traveler"), async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);

  const itineraryId = await getOwnedTripItineraryId(tripId, userId);
  if (itineraryId === false) { res.status(403).json({ error: "No es tu viaje" }); return; }

  await db.delete(itineraryDaysTable)
    .where(and(eq(itineraryDaysTable.id, dayId), eq(itineraryDaysTable.itineraryId, itineraryId as number)));

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

export default router;
