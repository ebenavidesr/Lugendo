import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agenciesTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { AgencyInputSchema, AgencyUpdateSchema } from "../lib/schemas";

const router: IRouter = Router();

router.get("/agencies", requireRoles("admin"), async (req, res): Promise<void> => {
  const agencies = await db
    .select()
    .from(agenciesTable)
    .orderBy(agenciesTable.name);
  res.json(agencies.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

router.post("/agencies", requireRoles("admin"), validate(AgencyInputSchema), async (req, res): Promise<void> => {
  const { name, slug, logoUrl, primaryColor } = req.body;
  const [agency] = await db
    .insert(agenciesTable)
    .values({ name, slug, logoUrl, primaryColor })
    .returning();
  res.status(201).json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

router.get("/agencies/me", requireAuth, async (req, res): Promise<void> => {
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(404).json({ error: "No agency associated" }); return; }
  const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, agencyId));
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

router.get("/agencies/:agencyId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, id));
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

router.patch("/agencies/:agencyId", requireRoles("admin", "manager"), validate(AgencyUpdateSchema), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const { name, logoUrl, primaryColor, writingTone, active } = req.body;
  const [agency] = await db
    .update(agenciesTable)
    .set({
      ...(name && { name }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(writingTone !== undefined && { writingTone }),
      ...(active !== undefined && { active }),
    })
    .where(eq(agenciesTable.id, id))
    .returning();
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

export default router;
