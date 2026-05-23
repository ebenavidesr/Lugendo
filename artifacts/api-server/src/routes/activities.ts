import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { activitiesTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(a: typeof activitiesTable.$inferSelect) {
  return {
    ...a,
    durationHours: a.durationHours ? parseFloat(a.durationHours) : null,
    pricePerPerson: a.pricePerPerson ? parseFloat(a.pricePerPerson) : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/activities", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const rows = role === "admin"
    ? await db.select().from(activitiesTable).orderBy(activitiesTable.name)
    : agencyId
      ? await db.select().from(activitiesTable).where(eq(activitiesTable.agencyId, agencyId)).orderBy(activitiesTable.name)
      : [];
  res.json(rows.map(serialize));
});

router.post("/activities", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const { name, description, category, durationHours, city, country, pricePerPerson, minPax, maxPax } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(400).json({ error: "No agency associated" }); return; }
  const [activity] = await db
    .insert(activitiesTable)
    .values({ agencyId, name, description, category, durationHours, city, country, pricePerPerson, minPax, maxPax })
    .returning();
  res.status(201).json(serialize(activity));
});

router.get("/activities/:activityId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.activityId, 10);
  const [activity] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, id));
  if (!activity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(activity));
});

router.patch("/activities/:activityId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.activityId, 10);
  const fields = req.body;
  const [activity] = await db.update(activitiesTable).set(fields).where(eq(activitiesTable.id, id)).returning();
  if (!activity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(activity));
});

router.delete("/activities/:activityId", requireRoles("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.activityId, 10);
  await db.delete(activitiesTable).where(eq(activitiesTable.id, id));
  res.status(204).send();
});

export default router;
