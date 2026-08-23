import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { tripSharesTable, usersTable, tripsTable, agenciesTable } from "@workspace/db";
import { requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { InvitationInputSchema, InvitationUpdateSchema } from "../lib/schemas";
import { sendInvitationEmail } from "../lib/email";
import { PUBLIC_APP_URL } from "../lib/publicUrl";
import { ensureTripClassificationByDates } from "../lib/trip-classification";
import { backfillSharedWithAll } from "../lib/shared-with-all-backfill";

const router: IRouter = Router();

const COLD_INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function makeToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// admin bypasses; manager/agent must belong to the trip's own agency.
async function verifyAgencyOwnsTrip(tripId: number, role: string | undefined, agencyId: number | null | undefined): Promise<boolean> {
  const [trip] = await db.select({ agencyId: tripsTable.agencyId }).from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) return false;
  if (role === "admin") return true;
  return agencyId != null && trip.agencyId === agencyId;
}

interface InvRow {
  id: number;
  tripId: number;
  email: string;
  status: "pending" | "accepted" | "rejected";
  segment: "basic" | "standard" | "premium" | null;
  travelerId: number | null;
  createdAt: Date;
  acceptedAt: Date | null;
  travelerName?: string | null;
}

function serialize(i: InvRow) {
  return {
    id: i.id,
    tripId: i.tripId,
    email: i.email,
    status: i.status,
    segment: i.segment ?? null,
    travelerId: i.travelerId ?? null,
    travelerName: i.travelerName ?? null,
    createdAt: i.createdAt.toISOString(),
    acceptedAt: i.acceptedAt?.toISOString() ?? null,
  };
}

router.get("/trips/:tripId/invitations", requireRoles("admin", "manager", "agent", "advisor"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  if (!await verifyAgencyOwnsTrip(tripId, req.session.role, req.session.agencyId)) {
    res.status(403).json({ error: "No autorizado para ver las invitaciones de este viaje" });
    return;
  }
  const rows = await db
    .select({
      id: tripSharesTable.id,
      tripId: tripSharesTable.tripId,
      email: tripSharesTable.sharedWithEmail,
      status: tripSharesTable.status,
      segment: tripSharesTable.segment,
      travelerId: tripSharesTable.sharedWithUserId,
      createdAt: tripSharesTable.createdAt,
      acceptedAt: tripSharesTable.acceptedAt,
      travelerName: usersTable.name,
    })
    .from(tripSharesTable)
    .leftJoin(usersTable, eq(tripSharesTable.sharedWithUserId, usersTable.id))
    .where(and(eq(tripSharesTable.tripId, tripId), eq(tripSharesTable.origin, "agency")));
  res.json(rows.map(r => serialize(r as InvRow)));
});

router.post("/trips/:tripId/invitations", requireRoles("admin", "manager", "agent", "advisor"), validate(InvitationInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  if (!await verifyAgencyOwnsTrip(tripId, req.session.role, req.session.agencyId)) {
    res.status(403).json({ error: "No autorizado para invitar a este viaje" });
    return;
  }

  // Accept both old format {emails: string[]} and new format {invitees: [{email, segment?}]}
  let invitees: Array<{ email: string; segment?: string | null }> = [];
  if (Array.isArray(req.body.invitees)) {
    invitees = req.body.invitees;
  } else if (Array.isArray(req.body.emails)) {
    invitees = req.body.emails.map((email: string) => ({ email }));
  }

  if (invitees.length === 0) {
    res.status(201).json([]);
    return;
  }

  const existing = await db
    .select({ email: tripSharesTable.sharedWithEmail })
    .from(tripSharesTable)
    .where(and(eq(tripSharesTable.tripId, tripId), eq(tripSharesTable.origin, "agency")));
  const existingSet = new Set(existing.map(e => e.email.toLowerCase()));

  const newInvitees = invitees.filter(inv => !existingSet.has(inv.email.toLowerCase()));
  if (newInvitees.length === 0) {
    res.status(201).json([]);
    return;
  }

  // Agency invitees always enter as a full "member" (task #161 decision) -- this doesn't
  // grant edit rights over the official itinerary, that restriction lives elsewhere (#151).
  const toInsert = await Promise.all(newInvitees.map(async (inv) => {
    const email = inv.email.toLowerCase().trim();
    const [recipient] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    return {
      tripId,
      ownerId: req.session.userId!,
      sharedWithEmail: email,
      sharedWithUserId: recipient?.id ?? null,
      inviteToken: makeToken(),
      tokenExpiresAt: recipient ? null : new Date(Date.now() + COLD_INVITE_TOKEN_TTL_MS),
      permission: "full" as const,
      memberType: "member" as const,
      origin: "agency" as const,
      segment: (inv.segment ?? null) as "basic" | "standard" | "premium" | null,
      status: (recipient ? "accepted" : "pending") as "accepted" | "pending",
      acceptedAt: recipient ? new Date() : null,
    };
  }));

  const created = await db.insert(tripSharesTable).values(toInsert).returning();

  // Recipients who already had an account were inserted as accepted directly (task #161:
  // no manual accept step) -- run the same classification side effects the old accept
  // endpoint used to run. Cold invitees stay pending until resolvePendingTripSharesForUser
  // links them at registration/verification time.
  for (const share of created) {
    if (share.status === "accepted" && share.sharedWithUserId) {
      await ensureTripClassificationByDates(share.sharedWithUserId, tripId);
      await backfillSharedWithAll(tripId, share.sharedWithUserId);
    }
  }

  // Send email notifications (fire-and-forget, don't block response)
  try {
    const [trip] = await db
      .select({ name: tripsTable.name, itineraryId: tripsTable.itineraryId })
      .from(tripsTable)
      .where(eq(tripsTable.id, tripId));
    const agencyId = req.session.agencyId;
    const [agency] = agencyId
      ? await db.select({ name: agenciesTable.name }).from(agenciesTable).where(eq(agenciesTable.id, agencyId))
      : [];
    const agencyName = agency?.name ?? "Lugendo";
    const tripName = trip?.name ?? "Tu viaje";
    for (const inv of created) {
      const hasAccount = inv.status === "accepted";
      sendInvitationEmail({
        to: inv.sharedWithEmail,
        agencyName,
        tripName,
        hasAccount,
        // Wouter uses plain paths, not hash-routing — no "/#/" prefix (see TESTING.md for
        // the 2026-07-30 bug where this landed on a blank page for every recipient).
        ctaUrl: `${PUBLIC_APP_URL}/${hasAccount ? "login" : `register?email=${encodeURIComponent(inv.sharedWithEmail)}`}`,
        tripId,
      }).catch(() => undefined);
    }
  } catch { /* non-fatal */ }

  res.status(201).json(created.map(r => serialize({ ...r, travelerId: r.sharedWithUserId, email: r.sharedWithEmail } as unknown as InvRow)));
});

router.patch("/trips/:tripId/invitations/:invitationId", requireRoles("admin", "manager", "agent", "advisor"), validate(InvitationUpdateSchema), async (req, res): Promise<void> => {
  const invitationId = parseInt(Array.isArray(req.params.invitationId) ? req.params.invitationId[0] : req.params.invitationId, 10);
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  if (!await verifyAgencyOwnsTrip(tripId, req.session.role, req.session.agencyId)) {
    res.status(403).json({ error: "No autorizado para editar invitaciones de este viaje" });
    return;
  }
  const { segment } = req.body as { segment?: "basic" | "standard" | "premium" | null };

  const [updated] = await db
    .update(tripSharesTable)
    .set({ segment: segment ?? null })
    .where(and(eq(tripSharesTable.id, invitationId), eq(tripSharesTable.origin, "agency")))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  const [traveler] = updated.sharedWithUserId
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, updated.sharedWithUserId))
    : [];

  res.json(serialize({ ...updated, email: updated.sharedWithEmail, travelerId: updated.sharedWithUserId, travelerName: traveler?.name ?? null } as unknown as InvRow));
});

router.delete("/trips/:tripId/invitations/:invitationId", requireRoles("admin", "manager", "agent", "advisor"), async (req, res): Promise<void> => {
  const invitationId = parseInt(Array.isArray(req.params.invitationId) ? req.params.invitationId[0] : req.params.invitationId, 10);
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  if (!await verifyAgencyOwnsTrip(tripId, req.session.role, req.session.agencyId)) {
    res.status(403).json({ error: "No autorizado para eliminar invitaciones de este viaje" });
    return;
  }
  await db.delete(tripSharesTable).where(and(eq(tripSharesTable.id, invitationId), eq(tripSharesTable.origin, "agency")));
  res.sendStatus(204);
});

export default router;
