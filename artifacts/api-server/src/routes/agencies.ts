import { Router, type IRouter } from "express";
import multer from "multer";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { agenciesTable, itinerariesTable, tripsTable, usersTable, hotelsTable, activitiesTable } from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { AgencyInputSchema, AgencyUpdateSchema } from "../lib/schemas";
import { ObjectStorageService } from "../lib/objectStorage";
import { sanitizeSvg, sanitizeNoteHtml } from "../lib/sanitize";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const LOGO_EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in LOGO_EXT_BY_MIME)) {
      cb(new Error("UNSUPPORTED_LOGO_FORMAT"));
      return;
    }
    cb(null, true);
  },
});

router.get("/agencies", requireRoles("admin"), async (req, res): Promise<void> => {
  const agencies = await db
    .select()
    .from(agenciesTable)
    .orderBy(agenciesTable.name);
  res.json(agencies.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

router.post("/agencies", requireRoles("admin"), validate(AgencyInputSchema), async (req, res): Promise<void> => {
  const { name, slug, logoUrl, primaryColor, description, publicProfileEnabled, agencyType } = req.body;
  const [agency] = await db
    .insert(agenciesTable)
    .values({ name, slug, logoUrl, primaryColor, description: description ? sanitizeNoteHtml(description) : description, publicProfileEnabled: publicProfileEnabled ?? false, agencyType: agencyType ?? "agency" })
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

router.patch("/agencies/:agencyId", requireRoles("admin", "manager", "advisor"), validate(AgencyUpdateSchema), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const { name, logoUrl, primaryColor, writingTone, active, description, publicProfileEnabled, agencyType } = req.body;
  // La descripción pública es gestionable por Admin, Manager y Asesor de Viajes (decisión de
  // alcance revisada de la #162 tras QA) — el Agente no llega a esta ruta porque el propio
  // requireRoles de este endpoint ya lo excluye.
  if (description !== undefined && req.session.role !== "admin" && req.session.role !== "manager" && req.session.role !== "advisor") {
    res.status(403).json({ error: "Solo un administrador, manager o asesor puede editar la descripción pública" });
    return;
  }
  // El tipo de agencia (agencia/asesor) es clasificación de plataforma, solo Admin la cambia.
  if (agencyType !== undefined && req.session.role !== "admin") {
    res.status(403).json({ error: "Solo un administrador puede cambiar el tipo de agencia" });
    return;
  }
  const [agency] = await db
    .update(agenciesTable)
    .set({
      ...(name && { name }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(writingTone !== undefined && { writingTone }),
      ...(active !== undefined && { active }),
      ...(description !== undefined && { description: description ? sanitizeNoteHtml(description) : description }),
      ...(publicProfileEnabled !== undefined && { publicProfileEnabled }),
      ...(agencyType !== undefined && { agencyType }),
    })
    .where(eq(agenciesTable.id, id))
    .returning();
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

router.delete("/agencies/:agencyId", requireRoles("admin"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const [existing] = await db.select({ id: agenciesTable.id }).from(agenciesTable).where(eq(agenciesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const [
    [{ count: linkedItineraries }],
    [{ count: linkedTrips }],
    [{ count: linkedUsers }],
    [{ count: linkedHotels }],
    [{ count: linkedActivities }],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(itinerariesTable).where(eq(itinerariesTable.agencyId, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(eq(tripsTable.agencyId, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.agencyId, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(hotelsTable).where(eq(hotelsTable.agencyId, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(activitiesTable).where(eq(activitiesTable.agencyId, id)),
  ]);

  if (linkedItineraries > 0 || linkedTrips > 0 || linkedUsers > 0 || linkedHotels > 0 || linkedActivities > 0) {
    const parts = [
      linkedItineraries > 0 && `${linkedItineraries} itinerario(s)`,
      linkedTrips > 0 && `${linkedTrips} viaje(s)`,
      linkedUsers > 0 && `${linkedUsers} usuario(s)`,
      linkedHotels > 0 && `${linkedHotels} hotel(es)`,
      linkedActivities > 0 && `${linkedActivities} actividad(es)`,
    ].filter(Boolean).join(", ");
    res.status(409).json({
      error: `No se puede borrar: tiene ${parts} vinculados`,
      linkedItineraries, linkedTrips, linkedUsers, linkedHotels, linkedActivities,
    });
    return;
  }

  await db.delete(agenciesTable).where(eq(agenciesTable.id, id));
  res.sendStatus(204);
});

router.post("/agencies/:agencyId/logo", requireRoles("admin", "manager", "advisor"), (req, res, next) => {
  logoUpload.single("logo")(req, res, (err: unknown) => {
    if (!err) { next(); return; }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Ese archivo pesa demasiado. Prueba con uno de menos de 2 MB." });
      return;
    }
    if (err instanceof Error && err.message === "UNSUPPORTED_LOGO_FORMAT") {
      res.status(400).json({ error: "Formato no soportado. Usa PNG, JPG, SVG o WebP." });
      return;
    }
    res.status(400).json({ error: "Error al subir el archivo" });
  });
}, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const file = req.file;
  if (!file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }

  let buffer = file.buffer;
  if (file.mimetype === "image/svg+xml") {
    const sanitized = sanitizeSvg(buffer.toString("utf-8"));
    if (!sanitized) { res.status(400).json({ error: "El SVG no es válido" }); return; }
    buffer = Buffer.from(sanitized, "utf-8");
  }

  const objectPath = await objectStorage.uploadPublicBuffer(buffer, "agency-logos", LOGO_EXT_BY_MIME[file.mimetype], file.mimetype);
  const logoFileUrl = `/api/storage/public-objects/${objectPath}`;

  const [agency] = await db.update(agenciesTable).set({ logoFileUrl }).where(eq(agenciesTable.id, id)).returning();
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

router.delete("/agencies/:agencyId/logo", requireRoles("admin", "manager", "advisor"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.agencyId) ? req.params.agencyId[0] : req.params.agencyId, 10);
  const [agency] = await db.update(agenciesTable).set({ logoFileUrl: null }).where(eq(agenciesTable.id, id)).returning();
  if (!agency) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...agency, createdAt: agency.createdAt.toISOString() });
});

export default router;
