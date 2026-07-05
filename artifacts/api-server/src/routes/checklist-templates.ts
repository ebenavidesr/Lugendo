import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { checklistTemplatesTable } from "@workspace/db";
import { requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { ChecklistTemplateInputSchema, ChecklistTemplateUpdateSchema } from "../lib/schemas";

const router: IRouter = Router();

function serialize(t: typeof checklistTemplatesTable.$inferSelect) {
  return { ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() };
}

router.get("/checklist-templates", requireRoles("admin", "manager"), async (req, res): Promise<void> => {
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.json([]); return; }
  const rows = await db
    .select()
    .from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.agencyId, agencyId))
    .orderBy(checklistTemplatesTable.title);
  res.json(rows.map(serialize));
});

router.post("/checklist-templates", requireRoles("admin", "manager"), validate(ChecklistTemplateInputSchema), async (req, res): Promise<void> => {
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(400).json({ error: "No agency associated with this account" }); return; }
  const { title, active } = req.body;
  const [template] = await db
    .insert(checklistTemplatesTable)
    .values({ agencyId, title, active })
    .returning();
  res.status(201).json(serialize(template));
});

router.patch("/checklist-templates/:templateId", requireRoles("admin", "manager"), validate(ChecklistTemplateUpdateSchema), async (req, res): Promise<void> => {
  const agencyId = req.session.agencyId;
  const id = parseInt(Array.isArray(req.params.templateId) ? req.params.templateId[0] : req.params.templateId, 10);
  const fields = req.body;
  const [template] = await db
    .update(checklistTemplatesTable)
    .set(fields)
    .where(and(eq(checklistTemplatesTable.id, id), eq(checklistTemplatesTable.agencyId, agencyId ?? -1)))
    .returning();
  if (!template) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(template));
});

router.delete("/checklist-templates/:templateId", requireRoles("admin", "manager"), async (req, res): Promise<void> => {
  const agencyId = req.session.agencyId;
  const id = parseInt(Array.isArray(req.params.templateId) ? req.params.templateId[0] : req.params.templateId, 10);
  await db
    .delete(checklistTemplatesTable)
    .where(and(eq(checklistTemplatesTable.id, id), eq(checklistTemplatesTable.agencyId, agencyId ?? -1)));
  res.sendStatus(204);
});

export default router;
