import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  itinerariesTable, itineraryDaysTable, itineraryDayHotelsTable, itineraryDayActivitiesTable,
  hotelsTable, tripsTable, activitiesTable, usersTable,
} from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import {
  ItineraryInputSchema, ItineraryUpdateSchema,
  ItineraryDayInputSchema, ItineraryDayUpdateSchema,
  DayHotelInputSchema, ItineraryDayActivityInputSchema, ItineraryDayActivityUpdateSchema,
} from "../lib/schemas";
import { sql } from "drizzle-orm";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

function serializeItinerary(i: typeof itinerariesTable.$inferSelect, tripCount = 0, createdByName: string | null = null) {
  return { ...i, createdAt: i.createdAt.toISOString(), tripCount, createdByName };
}

function serializeDayHotel(r: {
  id: number; hotelId: number; hotelName: string; hotelCity: string | null;
  hotelAddress: string | null; hotelPhone: string | null; hotelWebsite: string | null;
  segment: string | null; guaranteed: boolean; alternatives: string[]; reviewManually: boolean; createdAt: Date;
}) {
  return { id: r.id, hotelId: r.hotelId, hotelName: r.hotelName, hotelCity: r.hotelCity, hotelAddress: r.hotelAddress, hotelPhone: r.hotelPhone, hotelWebsite: r.hotelWebsite, segment: r.segment, guaranteed: r.guaranteed, alternatives: r.alternatives, reviewManually: r.reviewManually, createdAt: r.createdAt.toISOString() };
}

async function getDayHotelMap(dayIds: number[]) {
  if (dayIds.length === 0) return {} as Record<number, ReturnType<typeof serializeDayHotel>[]>;
  const rows = await db
    .select({
      id: itineraryDayHotelsTable.id,
      dayId: itineraryDayHotelsTable.itineraryDayId,
      hotelId: itineraryDayHotelsTable.hotelId,
      hotelName: hotelsTable.name,
      hotelCity: hotelsTable.city,
      hotelAddress: hotelsTable.address,
      hotelPhone: hotelsTable.phone,
      hotelWebsite: hotelsTable.website,
      segment: itineraryDayHotelsTable.segment,
      guaranteed: itineraryDayHotelsTable.guaranteed,
      alternatives: itineraryDayHotelsTable.alternatives,
      reviewManually: itineraryDayHotelsTable.reviewManually,
      createdAt: itineraryDayHotelsTable.createdAt,
    })
    .from(itineraryDayHotelsTable)
    .innerJoin(hotelsTable, eq(itineraryDayHotelsTable.hotelId, hotelsTable.id))
    .where(inArray(itineraryDayHotelsTable.itineraryDayId, dayIds))
    .orderBy(itineraryDayHotelsTable.createdAt);
  const map: Record<number, ReturnType<typeof serializeDayHotel>[]> = {};
  for (const r of rows) {
    if (!map[r.dayId]) map[r.dayId] = [];
    map[r.dayId].push(serializeDayHotel({ ...r, hotelCity: r.hotelCity ?? null }));
  }
  return map;
}

router.get("/itineraries", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const rows = role === "admin"
    ? await db.select().from(itinerariesTable).orderBy(itinerariesTable.name)
    : agencyId
      ? await db.select().from(itinerariesTable).where(eq(itinerariesTable.agencyId, agencyId)).orderBy(itinerariesTable.name)
      : [];

  const [tripCounts, creators] = await Promise.all([
    db.select({ itineraryId: tripsTable.itineraryId, count: sql<number>`count(*)::int` })
      .from(tripsTable)
      .groupBy(tripsTable.itineraryId),
    db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, [...new Set(rows.map(r => r.createdBy).filter((id): id is number => id != null))])),
  ]);
  const countMap = Object.fromEntries(tripCounts.map(t => [t.itineraryId, t.count]));
  const creatorMap = Object.fromEntries(creators.map(u => [u.id, u.name]));

  res.json(rows.map(i => serializeItinerary(i, countMap[i.id] ?? 0, i.createdBy != null ? (creatorMap[i.createdBy] ?? null) : null)));
});

// ─── PARSE PDF (must come before /:itineraryId to avoid routing conflicts) ───
router.post("/itineraries/parse-pdf", requireRoles("admin", "manager", "agent", "traveler"), async (req, res): Promise<void> => {
  const { fileBase64, fileName } = req.body as { fileBase64: string; fileName: string };
  if (!fileBase64 || !fileName) {
    res.status(400).json({ error: "fileBase64 and fileName are required" });
    return;
  }

  let extractedText = "";
  const buffer = Buffer.from(fileBase64, "base64");
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    try {
      const parsed = await pdfParse(buffer);
      extractedText = parsed.text;
    } catch (err) {
      req.log.error({ err }, "PDF parse error");
      res.status(422).json({ error: "Could not parse PDF. Try uploading a text file instead." });
      return;
    }
  } else if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } catch (err) {
      req.log.error({ err }, "DOCX parse error");
      res.status(422).json({ error: "Could not parse the Word document. Try uploading a PDF instead." });
      return;
    }
  } else {
    extractedText = buffer.toString("utf-8");
  }

  if (!extractedText.trim()) {
    res.status(422).json({ error: "No text content found in file." });
    return;
  }

  const trimmedText = extractedText.slice(0, 24000);

  const systemPrompt = `Eres un extractor de itinerarios de documentos de agencias de viaje (fichas técnicas, dossiers, folletos en PDF/Word). Los documentos NO tienen un formato único: la misma información (hotel, actividad, comida) puede aparecer en tabla, en prosa, o repetida en dos sitios con matices distintos. Tu trabajo es RECONCILIAR, no solo localizar. Devuelve SOLO JSON válido.

## Detección de estructura
Antes de extraer, identifica qué bloques existen:
- Tabla resumen de itinerario (columnas tipo DÍA | ITINERARIO | ALOJAMIENTO | COMIDA, o variantes "HOTEL", "RÉGIMEN"; títulos "Itinerario previsto", "Programa día a día").
- Desarrollo día a día en prosa (bloques "Día N", "DÍA N.-", "Dia N-" seguidos de localidad/ruta y párrafo). Puede incluir línea "Régimen de alimentación: ...".
- Listado de hoteles por ciudad ("HOTELES SELECCIONADOS", "ALOJAMIENTOS PREVISTOS", formato "CIUDAD: Hotel A, Hotel B o similar"). No está indexado por día: crúzalo usando la ciudad/localidad como clave.
- Bloques de logística/legal (visado, vacunas, moneda, clima, seguro, condiciones de reserva, contrato, protección de datos): NO van al itinerario; evalúa si van a notas/checklist.
- Bloque de equipaje ("Equipo personal", "Qué llevar", "Equipaje recomendado") → checklist.
- Puntos fuertes / highlights → recommendations, no actividades.
Si un bloque no existe, no falles: extrae lo que haya y deja los campos vacíos. No inventes contenido.
Reconciliación: la tabla/lista estructurada manda sobre la prosa para datos concretos (fechas, nombres de hotel); la prosa manda para contenido narrativo (descripciones, actividades). Nunca descartes un bloque de texto sin evaluar si es nota o ítem de checklist.

## Estructura JSON exacta de salida
{
  "name": "string - nombre descriptivo del viaje",
  "numDays": number,
  "description": "string o null - descripción general del viaje",
  "countries": ["países del viaje"],
  "startDate": "YYYY-MM-DD o null",
  "endDate": "YYYY-MM-DD o null",
  "tripNotes": ["notas a nivel de viaje completo"],
  "recommendations": ["recomendaciones y puntos fuertes"],
  "checklist": [{"item": "string corto y accionable", "category": "Equipaje|Documentación|Salud|Dinero o el título de la sección original, o null"}],
  "days": [
    {
      "dayNumber": 1,
      "title": "string o null - título COMPLETO del día, sin truncar aunque tenga varias localidades separadas por guión",
      "localities": ["cada localidad mencionada en el título del día"],
      "cityFrom": "string o null - ciudad de salida",
      "cityTo": "string o null - ciudad de llegada/principal del día",
      "transport": "string o null - uno de: plane, ship, ferry, train, self_drive, car_driver, bus, motorcycle, bicycle, walking. null si no hay desplazamiento.",
      "description": "string o null - descripción narrativa del día (usa la prosa, no solo la tabla)",
      "meals": "string o null - régimen de comidas normalizado",
      "hotel": {
        "name": "string - hotel principal del día",
        "guaranteed": boolean,
        "alternatives": ["hoteles alternativos"],
        "source": "tabla | listado_ciudad | tabla+listado_ciudad | prosa",
        "reviewManually": boolean
      } (o null si el día no tiene hotel, p. ej. día de vuelo),
      "parsedActivities": [
        {"title": "string corto", "description": "string o null - una o dos frases concisas del original", "type": "Visita|Traslado|Libre|Gastronomía|Vuelo|Actividad", "moment": "mañana|tarde|noche o null"}
      ],
      "dayNotes": ["notas que aplican solo a este día"]
    }
  ]
}

## Días
- Un día se identifica por fila de tabla con número, O encabezado tipo "Día N" (con/sin tilde, punto o guión). El número de día es la clave de unión entre tabla y prosa: fusiona ambos en el mismo día, nunca dupliques.
- dayNumber empieza en 1 y es secuencial. numDays debe coincidir con la duración declarada del documento (ej. "17 DÍAS" en el título).
- Días de vuelo/llegada sin actividades propias ("Día 1.- VUELOS ESPAÑA-COLOMBO"): crea el día igualmente, con parsedActivities vacío o una única actividad tipo "Vuelo". No los omitas ni fusiones.
- title: guarda el título completo multilocalidad (ej. "GIRITALE-POLONNARUWA-SAFARI P.N.MINNERIYA-SIGIRIYA") y extrae cada localidad en localities.

## Hoteles (orden de prioridad)
1. Fuente primaria: columna de alojamiento de la tabla resumen — es el hotel oficial del día.
2. Fuente secundaria: listado de hoteles por ciudad. Cruza por ciudad/localidad:
   - Si el hotel de la tabla coincide con uno del listado → confírmalo como principal y añade el resto como alternatives. source: "tabla+listado_ciudad".
   - Si el hotel de la tabla NO aparece en el listado → conserva el de la tabla como principal, añade el listado completo como alternatives y marca reviewManually: true.
3. Si solo existe uno de los dos bloques, usa ese (source: "tabla" o "listado_ciudad" o "prosa").
4. "o similar", "o de igual categoría" → guaranteed: false. Es información relevante, no ruido.
5. Un hotel repetido en días consecutivos es normal (varias noches): vincúlalo a cada día.
6. Menciones genéricas sin nombre propio ("Hotel", "Alojamiento en categoría turista") NO son hoteles: van a la descripción o notas del día.

## Actividades
- Descompón el párrafo narrativo de cada día en actividades discretas. Señales: verbos de acción ("Visitaremos...", "Recorreremos...", "Haremos un safari..."), nombres propios de lugares/monumentos/parques, conectores de secuencia ("por la mañana", "al atardecer") como pista de moment, no como actividad.
- Agrupa frases que describen la misma visita en UNA actividad ("Visitaremos Polonnaruwa... los budas de Gal Vihara" = una sola actividad).
- Traslados puros ("Traslado a Sigiriya", "Traslado al aeropuerto") → type "Traslado".
- Día libre ("Día libre para disfrutar del mar...") → una única actividad type "Libre", no lo dejes vacío.
- Comidas destacadas (cena especial, almuerzo típico) → type "Gastronomía".
- moment solo si el texto lo indica; null si no. No inventes horarios.

## Comidas (meals)
Normaliza: "D" → "Desayuno"; "CE" o "C" → "Cena"; "D, CE" → "Desayuno y cena"; "Régimen de alimentación: Desayuno, (pic nic) y cena." → "Desayuno, pícnic y cena". Sin mención → null (no asumas nada). Si tabla y prosa difieren, prioriza la prosa (suele ser más completa).

## Notas
- Textos que empiezan con "NOTA:", "IMPORTANTE:", "MUY IMPORTANTE:", advertencias de variabilidad (orden de visitas, disponibilidad de hoteles/trenes, clima), restricciones operativas → notas.
- dayNotes si aplica a un día concreto; tripNotes si aplica a todo el viaje.
- Cláusulas puramente legales/contractuales (cancelación, protección de datos, responsabilidad civil) NO van a notas ni recomendaciones: descártalas.

## Checklist
- Secciones de equipaje, vacunas, documentación → una entrada por ítem. "Sombrero, gafas de sol, bañador, toalla y pañuelo" → 5 ítems, no 1.
- item corto y accionable; category: Equipaje, Documentación, Salud, Dinero, o el título de la sección original.

## Recomendaciones
- "Puntos fuertes"/highlights, consejos prácticos (cambio de moneda, propinas, época de reserva), explicaciones temáticas ampliadas de una parada ya extraída como actividad.

## Otros
- transport: mapea avión→plane, tren→train, ferry→ferry, barco→ship, autobús→bus, coche→self_drive, etc.
- startDate/endDate: fechas explícitas del documento ("4 de agosto, 2026" → "2026-08-04"); null si no hay.

## Validación final (antes de responder, verifica)
- ¿numDays coincide con la duración declarada y con days.length?
- ¿Todos los días tienen hotel O una explicación (día de vuelo) en notas/actividades?
- ¿Todos los días con desarrollo narrativo tienen al menos una actividad?
- ¿Se cruzaron tabla resumen y listado de hoteles por ciudad (no solo copiar uno)?
- ¿Hay checklist/notas capturadas, o el documento realmente no las tenía?
- ¿Ninguna cláusula legal se coló en notas o recomendaciones?

Devuelve SOLO el objeto JSON, sin markdown ni explicaciones.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 16384,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extrae el itinerario de este documento de viaje:\n\n${trimmedText}` },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      days?: Array<{
        activities?: string[];
        hotels?: string[];
        hotel?: { name?: string; alternatives?: string[] } | null;
        parsedActivities?: Array<{ title?: string }>;
      }>;
    };

    // Derive legacy string arrays (activities/hotels) from the structured fields
    // so existing wizard consumers keep working without changes.
    if (Array.isArray(parsed.days)) {
      for (const day of parsed.days) {
        if (!Array.isArray(day.activities) || day.activities.length === 0) {
          day.activities = (day.parsedActivities ?? [])
            .map(a => a?.title)
            .filter((t): t is string => typeof t === "string" && t.length > 0);
        }
        if (!Array.isArray(day.hotels) || day.hotels.length === 0) {
          day.hotels = day.hotel?.name ? [day.hotel.name] : [];
        }
      }
    }
    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "OpenAI parse error");
    res.status(500).json({ error: "AI extraction failed. Please try again." });
  }
});

router.post("/itineraries", requireAuth, validate(ItineraryInputSchema), async (req, res): Promise<void> => {
  const { name, countries, region, numDays, difficulty, description, videoUrl, recommendedMonths, priceRange, tags, tripNotes, recommendations, checklist } = req.body;
  const agencyId = req.session.agencyId ?? null;
  const createdBy = req.session.userId ?? null;
  const [itinerary] = await db
    .insert(itinerariesTable)
    .values({ agencyId, createdBy, name, countries: countries ?? [], region, numDays, difficulty, description, videoUrl, recommendedMonths: recommendedMonths ?? [], priceRange: priceRange ?? null, tags: tags ?? [], tripNotes: tripNotes ?? [], recommendations: recommendations ?? [], checklist: (checklist ?? []).map((c: { item: string; category?: string | null }) => ({ item: c.item, category: c.category ?? null })) })
    .returning();
  res.status(201).json(serializeItinerary(itinerary));
});

router.get("/itineraries/:itineraryId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const [itinerary] = await db.select().from(itinerariesTable).where(eq(itinerariesTable.id, id));
  if (!itinerary) { res.status(404).json({ error: "Not found" }); return; }

  const days = await db
    .select()
    .from(itineraryDaysTable)
    .where(eq(itineraryDaysTable.itineraryId, id))
    .orderBy(itineraryDaysTable.dayNumber);

  const hotelMap = await getDayHotelMap(days.map(d => d.id));

  res.json({
    ...serializeItinerary(itinerary),
    days: days.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), hotels: hotelMap[d.id] ?? [] })),
  });
});

router.patch("/itineraries/:itineraryId", requireRoles("admin", "manager", "agent"), validate(ItineraryUpdateSchema), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const fields = req.body;
  const [itinerary] = await db.update(itinerariesTable).set(fields).where(eq(itinerariesTable.id, id)).returning();
  if (!itinerary) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeItinerary(itinerary));
});

router.get("/itineraries/:itineraryId/usage", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const trips = await db
    .select({ id: tripsTable.id, name: tripsTable.name })
    .from(tripsTable)
    .where(eq(tripsTable.itineraryId, id));
  res.json({ trips });
});

router.delete("/itineraries/:itineraryId", requireRoles("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const unlinked = await db
    .update(tripsTable)
    .set({ itineraryId: null })
    .where(eq(tripsTable.itineraryId, id))
    .returning({ id: tripsTable.id });
  await db.delete(itinerariesTable).where(eq(itinerariesTable.id, id));
  res.json({ unlinkedTrips: unlinked.length });
});

router.get("/itineraries/:itineraryId/days", requireAuth, async (req, res): Promise<void> => {
  const itineraryId = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const days = await db
    .select()
    .from(itineraryDaysTable)
    .where(eq(itineraryDaysTable.itineraryId, itineraryId))
    .orderBy(itineraryDaysTable.dayNumber);

  const hotelMap = await getDayHotelMap(days.map(d => d.id));
  res.json(days.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), hotels: hotelMap[d.id] ?? [] })));
});

router.post("/itineraries/:itineraryId/days", requireAuth, validate(ItineraryDayInputSchema), async (req, res): Promise<void> => {
  const itineraryId = parseInt(Array.isArray(req.params.itineraryId) ? req.params.itineraryId[0] : req.params.itineraryId, 10);
  const { dayNumber, cityFrom, cityTo, cityFromCountry, cityToCountry, transport, description, meals, isTransitNight } = req.body;
  const [day] = await db
    .insert(itineraryDaysTable)
    .values({ itineraryId, dayNumber, cityFrom, cityTo, cityFromCountry, cityToCountry, transport, description, meals, ...(isTransitNight !== undefined ? { isTransitNight } : {}) })
    .returning();
  res.status(201).json({ ...day, createdAt: day.createdAt.toISOString(), hotels: [] });
});

router.patch("/itineraries/:itineraryId/days/:dayId", requireAuth, validate(ItineraryDayUpdateSchema), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { cityFrom, cityTo, cityFromCountry, cityToCountry, transport, description, meals, isTransitNight, photoUrl } = req.body;
  const patch: Record<string, unknown> = {};
  if (cityFrom !== undefined) patch.cityFrom = cityFrom;
  if (cityTo !== undefined) patch.cityTo = cityTo;
  if (cityFromCountry !== undefined) patch.cityFromCountry = cityFromCountry;
  if (cityToCountry !== undefined) patch.cityToCountry = cityToCountry;
  if (transport !== undefined) patch.transport = transport;
  if (description !== undefined) patch.description = description;
  if (meals !== undefined) patch.meals = meals;
  if (isTransitNight !== undefined) patch.isTransitNight = isTransitNight;
  if (photoUrl !== undefined) patch.photoUrl = photoUrl;
  const [day] = await db.update(itineraryDaysTable).set(patch).where(eq(itineraryDaysTable.id, dayId)).returning();
  if (!day) { res.status(404).json({ error: "Not found" }); return; }
  const hotelMap = await getDayHotelMap([day.id]);
  res.json({ ...day, createdAt: day.createdAt.toISOString(), hotels: hotelMap[day.id] ?? [] });
});

router.delete("/itineraries/:itineraryId/days/:dayId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  await db.delete(itineraryDaysTable).where(eq(itineraryDaysTable.id, dayId));
  res.sendStatus(204);
});

// ─── DAY HOTELS ───────────────────────────────────────────────────────────────
router.get("/itineraries/:itineraryId/days/:dayId/hotels", requireAuth, async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const hotelMap = await getDayHotelMap([dayId]);
  res.json(hotelMap[dayId] ?? []);
});

router.post("/itineraries/:itineraryId/days/:dayId/hotels", requireRoles("admin", "manager", "agent"), validate(DayHotelInputSchema), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { hotelId, segment, guaranteed, alternatives, reviewManually } = req.body as { hotelId: number; segment: "basic" | "standard" | "premium"; guaranteed?: boolean; alternatives?: string[]; reviewManually?: boolean };
  if (!hotelId) { res.status(400).json({ error: "hotelId is required" }); return; }

  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, hotelId));
  if (!hotel) { res.status(404).json({ error: "Hotel not found" }); return; }

  const [assignment] = await db
    .insert(itineraryDayHotelsTable)
    .values({ itineraryDayId: dayId, hotelId, segment, guaranteed: guaranteed ?? true, alternatives: alternatives ?? [], reviewManually: reviewManually ?? false })
    .returning();

  res.status(201).json(serializeDayHotel({ id: assignment.id, hotelId: assignment.hotelId, hotelName: hotel.name, hotelCity: hotel.city ?? null, hotelAddress: hotel.address ?? null, hotelPhone: hotel.phone ?? null, hotelWebsite: hotel.website ?? null, segment: assignment.segment, guaranteed: assignment.guaranteed, alternatives: assignment.alternatives, reviewManually: assignment.reviewManually, createdAt: assignment.createdAt }));
});

router.delete("/itineraries/:itineraryId/days/:dayId/hotels/:assignmentId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const assignmentId = parseInt(Array.isArray(req.params.assignmentId) ? req.params.assignmentId[0] : req.params.assignmentId, 10);
  await db.delete(itineraryDayHotelsTable).where(eq(itineraryDayHotelsTable.id, assignmentId));
  res.sendStatus(204);
});

// ─── DAY ACTIVITIES ──────────────────────────────────────────────────────────
router.get("/itineraries/:itineraryId/days/:dayId/activities", requireAuth, async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const rows = await db.execute(sql`
    SELECT ida.id, ida.day_id, ida.activity_id, a.name as activity_name, a.category as activity_category,
           ida.sort_order, ida.start_time, ida.time_of_day, ida.notes, ida.created_at
    FROM itinerary_day_activities ida
    JOIN activities a ON a.id = ida.activity_id
    WHERE ida.day_id = ${dayId}
    ORDER BY ida.sort_order, ida.created_at
  `);
  res.json((rows.rows as Array<Record<string, unknown>>).map(r => ({
    id: r.id,
    dayId: r.day_id,
    activityId: r.activity_id,
    activityName: r.activity_name,
    activityCategory: r.activity_category,
    sortOrder: r.sort_order,
    startTime: r.start_time ?? null,
    endTime: null,
    timeOfDay: r.time_of_day ?? null,
    notes: r.notes ?? null,
    included: true,
    canEdit: true,
    createdAt: String(r.created_at),
  })));
});

router.post("/itineraries/:itineraryId/days/:dayId/activities", requireAuth, validate(ItineraryDayActivityInputSchema), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { activityId, sortOrder = 0, notes, startTime, timeOfDay } = req.body;

  const insertResult = await db.execute(sql`
    INSERT INTO itinerary_day_activities (day_id, activity_id, sort_order, notes, start_time, time_of_day)
    VALUES (${dayId}, ${activityId}, ${sortOrder}, ${notes ?? null}, ${startTime ?? null}, ${timeOfDay ?? null})
    RETURNING id, day_id, activity_id, sort_order, notes, start_time, time_of_day, created_at
  `);
  const link = insertResult.rows[0] as Record<string, unknown>;
  const [act] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, activityId));
  res.status(201).json({
    id: link.id,
    dayId: link.day_id,
    activityId: link.activity_id,
    activityName: act?.name ?? "",
    activityCategory: act?.category ?? null,
    sortOrder: link.sort_order,
    startTime: link.start_time ?? null,
    timeOfDay: link.time_of_day ?? null,
    notes: link.notes,
    createdAt: String(link.created_at),
  });
});

router.patch("/itineraries/:itineraryId/days/:dayId/activities/:linkId", requireRoles("admin", "manager", "agent"), validate(ItineraryDayActivityUpdateSchema), async (req, res): Promise<void> => {
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  const body = req.body as { startTime?: string | null; notes?: string | null };

  const setValues: { startTime?: string | null; notes?: string | null } = {};
  if ("startTime" in body) setValues.startTime = body.startTime ?? null;
  if ("notes" in body) setValues.notes = body.notes ?? null;

  const [updated] = await db
    .update(itineraryDayActivitiesTable)
    .set(setValues)
    .where(eq(itineraryDayActivitiesTable.id, linkId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Link not found" }); return; }

  const [act] = await db.select({ name: activitiesTable.name, category: activitiesTable.category })
    .from(activitiesTable)
    .where(eq(activitiesTable.id, updated.activityId));

  res.json({
    id: updated.id,
    dayId: updated.dayId,
    activityId: updated.activityId,
    activityName: act?.name ?? "",
    activityCategory: act?.category ?? null,
    sortOrder: updated.sortOrder,
    startTime: updated.startTime ?? null,
    endTime: null,
    notes: updated.notes ?? null,
    included: true,
    canEdit: true,
    createdAt: String(updated.createdAt),
  });
});

router.delete("/itineraries/:itineraryId/days/:dayId/activities/:linkId", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const linkId = parseInt(Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId, 10);
  await db.execute(sql`DELETE FROM itinerary_day_activities WHERE id = ${linkId}`);
  res.sendStatus(204);
});

// ─── AI: SUGGEST DAY DESCRIPTION ─────────────────────────────────────────────
router.post("/itineraries/suggest-day-description", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
  const { dayNumber, cityFrom, cityTo, activities = [], writingTone = "friendly" } = req.body as {
    dayNumber: number;
    cityFrom?: string;
    cityTo?: string;
    activities?: string[];
    writingTone?: string;
  };

  const toneMap: Record<string, string> = {
    informative: "informativo y claro, con datos prácticos",
    friendly: "cercano y entusiasta, como un amigo experto",
    adventurous: "emocionante y aventurero, con energía y dinamismo",
    luxury: "elegante y sofisticado, con atención al detalle exclusivo",
    professional: "profesional y preciso, orientado al detalle",
  };
  const toneDesc = toneMap[writingTone] ?? toneMap["friendly"];

  const locationParts: string[] = [];
  if (cityFrom && cityTo && cityFrom !== cityTo) locationParts.push(`salida desde ${cityFrom} y llegada a ${cityTo}`);
  else if (cityTo) locationParts.push(`en ${cityTo}`);
  else if (cityFrom) locationParts.push(`salida desde ${cityFrom}`);

  const activitiesDesc = activities.length > 0
    ? `Actividades del día: ${activities.join(", ")}.`
    : "No hay actividades específicas definidas.";

  const prompt = `Eres un copywriter de agencias de viajes. Escribe una descripción atractiva para el Día ${dayNumber} de un itinerario de viaje.
Ubicación: ${locationParts.length > 0 ? locationParts.join(". ") : "Sin especificar"}.
${activitiesDesc}
Estilo de escritura: ${toneDesc}.
Escribe en español. La descripción debe tener entre 60 y 120 palabras. Solo devuelve el texto, sin títulos ni formateo adicional.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 200,
    temperature: 0.75,
  });

  const description = completion.choices[0]?.message?.content?.trim() ?? "";
  res.json({ description });
});

export default router;
