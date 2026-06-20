import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { UserInputSchema, UserUpdateSchema } from "../lib/schemas";

const router: IRouter = Router();

function serialize(u: typeof usersTable.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, agencyId: u.agencyId, active: u.active, createdAt: u.createdAt.toISOString() };
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
  const rawPassword = password || Math.random().toString(36).slice(-10);
  const passwordHash = await bcrypt.hash(rawPassword, 12);
  const targetAgencyId = req.session.role === "admin" ? (agencyId ?? req.session.agencyId) : req.session.agencyId;
  const [user] = await db
    .insert(usersTable)
    .values({ email: email.toLowerCase().trim(), passwordHash, name, role, agencyId: targetAgencyId })
    .returning();
  res.status(201).json(serialize(user));
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
  const { name, email, role, active, password } = req.body;

  const updateFields: Partial<typeof usersTable.$inferInsert> = {};
  if (name) updateFields.name = name;
  if (email) updateFields.email = email.toLowerCase().trim();
  if (role) updateFields.role = role;
  if (active !== undefined) updateFields.active = active;
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
