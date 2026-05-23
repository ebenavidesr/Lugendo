import { Router, type IRouter } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable, tripDaysTable, invitationsTable,
  agenciesTable, hotelsTable, tripNotesTable, itinerariesTable,
} from "@workspace/db";
import { requireRoles } from "../middlewares/auth";

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
  const { name, startDate, endDate } = req.body;

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

  // Access allowed if: invited traveler OR trip owner
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

  if (!invite && !ownedTrip) { res.status(404).json({ error: "Not found" }); return; }

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
      createdAt: tripsTable.createdAt,
    })
    .from(tripsTable)
    .leftJoin(agenciesTable, eq(tripsTable.agencyId, agenciesTable.id))
    .where(eq(tripsTable.id, tripId));

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
    .where(eq(tripDaysTable.tripId, tripId))
    .orderBy(tripDaysTable.dayNumber);

  res.json({
    ...row,
    isPersonal: row.ownerId != null && row.agencyName == null,
    agencyName: row.agencyName ?? null,
    agencyLogoUrl: row.agencyLogoUrl ?? null,
    createdAt: row.createdAt.toISOString(),
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

export default router;
