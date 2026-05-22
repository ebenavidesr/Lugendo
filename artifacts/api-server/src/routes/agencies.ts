import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agenciesTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/agencies", requireRoles("admin"), async (req, res): Promise<void> => {
  const agencies = await db
    .select()
    .from(agenciesTable)
    .orderBy(agenciesTable.name);
  res.json(agencies.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

router.post("/agencies", requireRoles("admin"), async (req, res): Promise<void> => {
  const { name, slug, logoUrl, primaryColor } = req.body;
  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }
  const [agency] = await db
    .insert(agenciesTable)
    .values({ name, slug, logoUrl, primaryColor })
    .returning();
  res.status(201).json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

router.get("/agencies/:agencyId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, id));
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

router.patch("/agencies/:agencyId", requireRoles("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const { name, logoUrl, primaryColor, active } = req.body;
  const [agency] = await db
    .update(agenciesTable)
    .set({ ...(name && { name }), ...(logoUrl !== undefined && { logoUrl }), ...(primaryColor !== undefined && { primaryColor }), ...(active !== undefined && { active }) })
    .where(eq(agenciesTable.id, id))
    .returning();
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

export default router;
