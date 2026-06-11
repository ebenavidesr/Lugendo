import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, agenciesTable, invitationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      agencyId: usersTable.agencyId,
      agencyName: agenciesTable.name,
    })
    .from(usersTable)
    .leftJoin(agenciesTable, eq(usersTable.agencyId, agenciesTable.id))
    .where(eq(usersTable.id, req.session.userId!));

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(user);
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      agencyId: usersTable.agencyId,
      passwordHash: usersTable.passwordHash,
      active: usersTable.active,
      agencyName: agenciesTable.name,
    })
    .from(usersTable)
    .leftJoin(agenciesTable, eq(usersTable.agencyId, agenciesTable.id))
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !user.active) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.agencyId = user.agencyId;
  req.session.email = user.email;
  req.session.name = user.name;

  // Auto-accept any pending invitations for this email
  await db
    .update(invitationsTable)
    .set({ status: "accepted", travelerId: user.id, acceptedAt: new Date() })
    .where(and(
      eq(invitationsTable.email, user.email),
      eq(invitationsTable.status, "pending"),
    ));

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId,
    agencyName: user.agencyName,
  });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, password, name, inviteCode } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: "email, password, name are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (existing) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role: "traveler",
    })
    .returning();

  if (inviteCode && user) {
    const { invitationsTable } = await import("@workspace/db");
    const [invite] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.inviteCode, inviteCode));
    if (invite && invite.status === "pending" && invite.email.toLowerCase() === user.email.toLowerCase()) {
      await db
        .update(invitationsTable)
        .set({ status: "accepted", travelerId: user.id, acceptedAt: new Date() })
        .where(eq(invitationsTable.id, invite.id));
    }
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.agencyId = user.agencyId ?? null;
  req.session.email = user.email;
  req.session.name = user.name;

  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId,
    agencyName: null,
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.sendStatus(204);
});

export default router;
