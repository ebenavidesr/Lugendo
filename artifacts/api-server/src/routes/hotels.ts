import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { hotelsTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

function serialize(h: typeof hotelsTable.$inferSelect) {
  return { ...h, createdAt: h.createdAt.toISOString() };
}

router.get("/hotels", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const rows = role === "admin"
    ? await db.select().from(hotelsTable).orderBy(hotelsTable.name)
    : agencyId
      ? await db.select().from(hotelsTable).where(eq(hotelsTable.agencyId, agencyId)).orderBy(hotelsTable.name)
      : [];
  res.json(rows.map(serialize));
});

router.post("/hotels", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const { name, city, country, address, phone, website, type, stars, segment, description } = req.body;
  if (!name || !city || !country) {
    res.status(400).json({ error: "name, city, country are required" });
    return;
  }
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(400).json({ error: "No agency associated" }); return; }
  const [hotel] = await db
    .insert(hotelsTable)
    .values({ agencyId, name, city, country, address, phone, website, type, stars, segment, description })
    .returning();
  res.status(201).json(serialize(hotel));
});

router.get("/hotels/:hotelId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.hotelId) ? req.params.hotelId[0] : req.params.hotelId, 10);
  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, id));
  if (!hotel) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(hotel));
});

router.patch("/hotels/:hotelId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.hotelId) ? req.params.hotelId[0] : req.params.hotelId, 10);
  const fields = req.body;
  const [hotel] = await db.update(hotelsTable).set(fields).where(eq(hotelsTable.id, id)).returning();
  if (!hotel) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(hotel));
});

export default router;
