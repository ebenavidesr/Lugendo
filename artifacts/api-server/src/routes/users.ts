import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import { usersTable, agenciesTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { UserInputSchema, UserUpdateSchema } from "../lib/schemas";
import { sendAgencyOnboardingEmail } from "../lib/email";
import { PUBLIC_APP_URL } from "../lib/publicUrl";

const router: IRouter = Router();
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function serialize(u: typeof usersTable.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, agencyId: u.agencyId, active: u.active, status: u.status, createdAt: u.createdAt.toISOString() };
}

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const { role, agencyId } = req.session;
  let rows: (typeof usersTable.$inferSelect)[];
  if (role === "admin") {
    rows = await db.select().from(usersTable).orderBy(usersTable.name);
  } else if (agencyId) {
    rows = await db.select().from(usersTable).where(eq(usersTable.agencyId, agencyId)).orderBy(usersTable.name);
  } else {
    rows = [];
  }
  res.json(rows.map(serialize));
});

router.post("/users", requireRoles("admin", "manager"), validate(UserInputSchema), async (req, res): Promise<void> => {
  const { email, name, role, agencyId, password } = req.body;
  const targetAgencyId = req.session.role === "admin" ? (agencyId ?? req.session.agencyId) : req.session.agencyId;
  if (role !== "traveler" && !targetAgencyId) {
    res.status(400).json({ error: "agencyId es obligatorio para roles de agencia" });
    return;
  }
  const rawPassword = password || Math.random().toString(36).slice(-10);
  const passwordHash = await bcrypt.hash(rawPassword, 12);
  const passwordResetToken = role !== "traveler" ? crypto.randomBytes(32).toString("hex") : null;
  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role,
      agencyId: targetAgencyId,
      passwordResetToken,
      passwordResetExpiresAt: passwordResetToken ? new Date(Date.now() + PASSWORD_RESET_TTL_MS) : null,
    })
    .returning();
  res.status(201).json(serialize(user));

  if (passwordResetToken && targetAgencyId) {
    const [agency] = await db.select({ name: agenciesTable.name }).from(agenciesTable).where(eq(agenciesTable.id, targetAgencyId));
    if (agency) {
      sendAgencyOnboardingEmail({
        to: user.email,
        name: user.name,
        agencyName: agency.name,
        activateUrl: `${PUBLIC_APP_URL}/reset-password?token=${passwordResetToken}`,
      }).catch((err) => req.log.error({ err }, "Failed to send agency onboarding email"));
    }
  }
});

router.get("/users/:userId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  if (req.session.role !== "admin" && user.agencyId !== req.session.agencyId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  res.json(serialize(user));
});

router.patch("/users/:userId", requireRoles("admin", "manager"), validate(UserUpdateSchema), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId, 10);
  const { name, email, role, agencyId, active, status, password } = req.body;

  const updateFields: Partial<typeof usersTable.$inferInsert> = {};
  if (name) updateFields.name = name;
  if (email) updateFields.email = email.toLowerCase().trim();
  if (role) updateFields.role = role;
  if (agencyId !== undefined && req.session.role === "admin") updateFields.agencyId = agencyId;
  if (active !== undefined) updateFields.active = active;
  if (status) {
    updateFields.status = status;
    updateFields.approvalToken = null;
  }
  if (password) updateFields.passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .update(usersTable)
    .set(updateFields)
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(user));
});

export default router;
