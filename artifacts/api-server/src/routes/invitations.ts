import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { invitationsTable, usersTable, tripsTable, agenciesTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { InvitationInputSchema, InvitationUpdateSchema } from "../lib/schemas";
import { sendInvitationEmail } from "../lib/email";
import { PUBLIC_APP_URL } from "../lib/publicUrl";

const router: IRouter = Router();

function makeCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

interface InvRow {
  id: number;
  tripId: number;
  email: string;
  inviteCode: string;
  status: "pending" | "accepted" | "declined";
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
    inviteCode: i.inviteCode,
    status: i.status,
    segment: i.segment ?? null,
    travelerId: i.travelerId ?? null,
    travelerName: i.travelerName ?? null,
    createdAt: i.createdAt.toISOString(),
    acceptedAt: i.acceptedAt?.toISOString() ?? null,
  };
}

router.get("/trips/:tripId/invitations", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const rows = await db
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
      travelerName: usersTable.name,
    })
    .from(invitationsTable)
    .leftJoin(usersTable, eq(invitationsTable.travelerId, usersTable.id))
    .where(eq(invitationsTable.tripId, tripId));
  res.json(rows.map(r => serialize(r as InvRow)));
});

router.post("/trips/:tripId/invitations", requireRoles("admin", "manager", "agent"), validate(InvitationInputSchema), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);

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
    .select({ email: invitationsTable.email })
    .from(invitationsTable)
    .where(eq(invitationsTable.tripId, tripId));
  const existingSet = new Set(existing.map(e => e.email.toLowerCase()));

  const toInsert = invitees
    .filter(inv => !existingSet.has(inv.email.toLowerCase()))
    .map(inv => ({
      tripId,
      email: inv.email.toLowerCase().trim(),
      inviteCode: makeCode(),
      segment: (inv.segment ?? null) as "basic" | "standard" | "premium" | null,
      createdBy: req.session.userId,
    }));

  if (toInsert.length === 0) {
    res.status(201).json([]);
    return;
  }

  const created = await db.insert(invitationsTable).values(toInsert).returning();

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
    const baseUrl = PUBLIC_APP_URL;
    for (const inv of created) {
      sendInvitationEmail({
        to: inv.email,
        agencyName,
        tripName,
        inviteCode: inv.inviteCode,
        registerUrl: `${baseUrl}/register?code=${inv.inviteCode}`,
      }).catch(() => undefined);
    }
  } catch { /* non-fatal */ }

  res.status(201).json(created.map(r => serialize(r as unknown as InvRow)));
});

router.patch("/trips/:tripId/invitations/:invitationId", requireRoles("admin", "manager", "agent"), validate(InvitationUpdateSchema), async (req, res): Promise<void> => {
  const invitationId = parseInt(Array.isArray(req.params.invitationId) ? req.params.invitationId[0] : req.params.invitationId, 10);
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { segment } = req.body as { segment?: "basic" | "standard" | "premium" | null };

  const [updated] = await db
    .update(invitationsTable)
    .set({ segment: segment ?? null })
    .where(eq(invitationsTable.id, invitationId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // Fetch traveler name
  const [traveler] = updated.travelerId
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, updated.travelerId))
    : [];

  res.json(serialize({ ...updated, travelerName: traveler?.name ?? null } as unknown as InvRow));
  void tripId;
});

router.delete("/trips/:tripId/invitations/:invitationId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const invitationId = parseInt(Array.isArray(req.params.invitationId) ? req.params.invitationId[0] : req.params.invitationId, 10);
  await db.delete(invitationsTable).where(eq(invitationsTable.id, invitationId));
  res.sendStatus(204);
});

router.post("/invitations/:code/accept", requireAuth, async (req, res): Promise<void> => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [invite] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.inviteCode, code));

  if (!invite) { res.status(404).json({ error: "Invitation not found" }); return; }
  if (invite.status === "accepted") { res.status(409).json({ error: "Already accepted" }); return; }

  // Security: logged-in user's email must match the invitation email
  const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
    res.status(403).json({ error: "Esta invitación es para otro correo electrónico" });
    return;
  }

  const [updated] = await db
    .update(invitationsTable)
    .set({ status: "accepted", travelerId: req.session.userId, acceptedAt: new Date() })
    .where(eq(invitationsTable.id, invite.id))
    .returning();

  res.json(serialize(updated as unknown as InvRow));
});

export default router;
