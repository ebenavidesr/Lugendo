import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { invitationsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";

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
      travelerId: invitationsTable.travelerId,
      createdAt: invitationsTable.createdAt,
      acceptedAt: invitationsTable.acceptedAt,
      travelerName: usersTable.name,
    })
    .from(invitationsTable)
    .leftJoin(usersTable, eq(invitationsTable.travelerId, usersTable.id))
    .where(eq(invitationsTable.tripId, tripId));
  res.json(rows.map(serialize));
});

router.post("/trips/:tripId/invitations", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const tripId = parseInt(Array.isArray(req.params.tripId) ? req.params.tripId[0] : req.params.tripId, 10);
  const { emails } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: "emails array is required" });
    return;
  }

  const existing = await db
    .select({ email: invitationsTable.email })
    .from(invitationsTable)
    .where(eq(invitationsTable.tripId, tripId));
  const existingSet = new Set(existing.map(e => e.email.toLowerCase()));

  const toInsert = emails
    .filter((e: string) => !existingSet.has(e.toLowerCase()))
    .map((email: string) => ({
      tripId,
      email: email.toLowerCase().trim(),
      inviteCode: makeCode(),
      createdBy: req.session.userId,
    }));

  if (toInsert.length === 0) {
    res.status(201).json([]);
    return;
  }

  const created = await db.insert(invitationsTable).values(toInsert).returning();
  res.status(201).json(created.map(serialize));
});

router.post("/invitations/:code/accept", requireAuth, async (req, res): Promise<void> => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const [invite] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.inviteCode, code));

  if (!invite) { res.status(404).json({ error: "Invitation not found" }); return; }
  if (invite.status === "accepted") { res.status(409).json({ error: "Already accepted" }); return; }

  const [updated] = await db
    .update(invitationsTable)
    .set({ status: "accepted", travelerId: req.session.userId, acceptedAt: new Date() })
    .where(eq(invitationsTable.id, invite.id))
    .returning();

  res.json(serialize(updated));
});

export default router;
