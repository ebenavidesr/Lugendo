import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { agencyInquiriesTable, agenciesTable, itinerariesTable, usersTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { AgencyInquiryInputSchema } from "../lib/schemas";
import { sendAgencyInquiryEmail } from "../lib/email";
import { PUBLIC_APP_URL } from "../lib/publicUrl";

const router: IRouter = Router();

function serialize(i: typeof agencyInquiriesTable.$inferSelect) {
  return { ...i, createdAt: i.createdAt.toISOString() };
}

// Un usuario con sesión envía una consulta a una agencia, opcionalmente referida a un
// itinerario del catálogo público. No requiere rol traveler específico — "sesión iniciada"
// es el único requisito decidido en la tarjeta #163.
router.post("/agency-inquiries", requireAuth, validate(AgencyInquiryInputSchema), async (req, res): Promise<void> => {
  const { agencyId, itineraryId, message } = req.body;
  const travelerId = req.session.userId!;

  const [agency] = await db.select().from(agenciesTable).where(and(eq(agenciesTable.id, agencyId), eq(agenciesTable.active, true)));
  if (!agency) { res.status(404).json({ error: "Agencia no encontrada" }); return; }

  let itineraryName: string | null = null;
  if (itineraryId != null) {
    const [itinerary] = await db.select({ name: itinerariesTable.name, agencyId: itinerariesTable.agencyId })
      .from(itinerariesTable).where(eq(itinerariesTable.id, itineraryId));
    if (!itinerary || itinerary.agencyId !== agencyId) { res.status(400).json({ error: "El itinerario no pertenece a esta agencia" }); return; }
    itineraryName = itinerary.name;
  }

  const [inquiry] = await db.insert(agencyInquiriesTable)
    .values({ agencyId, itineraryId: itineraryId ?? null, travelerId, message })
    .returning();

  const agencyStaff = await db.select({ email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(and(eq(usersTable.agencyId, agencyId), eq(usersTable.active, true)));
  const notifyEmails = agencyStaff.filter(u => u.role === "admin" || u.role === "manager" || u.role === "advisor").map(u => u.email);

  await Promise.allSettled(notifyEmails.map(to => sendAgencyInquiryEmail({
    to,
    agencyName: agency.name,
    travelerName: req.session.name!,
    travelerEmail: req.session.email!,
    itineraryName,
    message,
    inquiriesUrl: `${PUBLIC_APP_URL}/inquiries`,
  })));

  res.status(201).json(serialize(inquiry));
});

// Historial de consultas enviadas por el propio viajero.
router.get("/agency-inquiries/me", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: agencyInquiriesTable.id,
      agencyId: agencyInquiriesTable.agencyId,
      agencyName: agenciesTable.name,
      itineraryId: agencyInquiriesTable.itineraryId,
      itineraryName: itinerariesTable.name,
      message: agencyInquiriesTable.message,
      status: agencyInquiriesTable.status,
      createdAt: agencyInquiriesTable.createdAt,
    })
    .from(agencyInquiriesTable)
    .innerJoin(agenciesTable, eq(agencyInquiriesTable.agencyId, agenciesTable.id))
    .leftJoin(itinerariesTable, eq(agencyInquiriesTable.itineraryId, itinerariesTable.id))
    .where(eq(agencyInquiriesTable.travelerId, req.session.userId!))
    .orderBy(desc(agencyInquiriesTable.createdAt));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// Bandeja de consultas de la agencia (back office). Siempre filtrado por la agencia de la
// sesión — nunca por un agencyId recibido del cliente, para que una agencia no pueda leer
// las consultas de otra.
router.get("/agency-inquiries", requireRoles("admin", "manager", "advisor"), async (req, res): Promise<void> => {
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.json([]); return; }
  const rows = await db
    .select({
      id: agencyInquiriesTable.id,
      itineraryId: agencyInquiriesTable.itineraryId,
      itineraryName: itinerariesTable.name,
      travelerName: usersTable.name,
      travelerEmail: usersTable.email,
      message: agencyInquiriesTable.message,
      status: agencyInquiriesTable.status,
      createdAt: agencyInquiriesTable.createdAt,
    })
    .from(agencyInquiriesTable)
    .innerJoin(usersTable, eq(agencyInquiriesTable.travelerId, usersTable.id))
    .leftJoin(itinerariesTable, eq(agencyInquiriesTable.itineraryId, itinerariesTable.id))
    .where(eq(agencyInquiriesTable.agencyId, agencyId))
    .orderBy(desc(agencyInquiriesTable.createdAt));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.patch("/agency-inquiries/:inquiryId/read", requireRoles("admin", "manager", "advisor"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.inquiryId) ? req.params.inquiryId[0] : req.params.inquiryId, 10);
  const agencyId = req.session.agencyId;
  if (!agencyId) { res.status(404).json({ error: "Not found" }); return; }
  const [inquiry] = await db.update(agencyInquiriesTable)
    .set({ status: "read" })
    .where(and(eq(agencyInquiriesTable.id, id), eq(agencyInquiriesTable.agencyId, agencyId)))
    .returning();
  if (!inquiry) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(inquiry));
});

export default router;
