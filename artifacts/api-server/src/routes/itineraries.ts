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
  segment: string | null; createdAt: Date;
}) {
  return { id: r.id, hotelId: r.hotelId, hotelName: r.hotelName, hotelCity: r.hotelCity, hotelAddress: r.hotelAddress, hotelPhone: r.hotelPhone, hotelWebsite: r.hotelWebsite, segment: r.segment, createdAt: r.createdAt.toISOString() };
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
    } catch {
      res.status(422).json({ error: "Could not parse PDF. Try uploading a text file instead." });
      return;
    }
  } else if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } catch {
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

  const trimmedText = extractedText.slice(0, 12000);

  const systemPrompt = `You are a travel itinerary structure extractor. Given a travel program document, extract the itinerary details and return ONLY valid JSON.

The JSON must match this structure exactly:
{
  "name": "string - descriptive trip name",
  "numDays": number,
  "description": "string or null",
  "countries": ["array of country names"],
  "startDate": "YYYY-MM-DD or null - the trip start date if mentioned in the document",
  "endDate": "YYYY-MM-DD or null - the trip end date if mentioned in the document",
  "days": [
    {
      "dayNumber": 1,
      "cityFrom": "string or null - departure city",
      "cityTo": "string or null - arrival/main city for the day",
      "transport": "string or null - transport mode used to travel to this day's city. Use one of: plane, ship, ferry, train, self_drive, car_driver, bus, motorcycle, bicycle, walking. null if staying in same city.",
      "description": "string or null - day description and programme",
      "activities": ["array of ALL activity, excursion, tour and visit names mentioned for this day"],
      "hotels": ["array of hotel or accommodation names mentioned for this day - include any hotel, resort, lodge, hostel or accommodation name. Empty array if none mentioned."]
    }
  ]
}

Rules:
- dayNumber must start at 1 and be sequential
- Extract ALL activities, excursions, tours, visits and experiences mentioned per day — do not skip any
- Extract hotel/accommodation names exactly as written in the document; include one entry per hotel even if only one is mentioned for the day
- For transport: map modes to the enum values (avión→plane, tren→train, ferry→ferry, barco→ship, autobús→bus, coche→self_drive, etc.)
- If city doesn't change, cityFrom and cityTo can be the same city or null for cityFrom
- Keep descriptions concise but informative
- For startDate/endDate: look for explicit dates in the document header or first/last day entries. Format as YYYY-MM-DD (e.g. "4 de agosto, 2026" → "2026-08-04"). If not found, use null.
- Return ONLY the JSON object, no markdown, no explanation`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract the itinerary from this travel document:\n\n${trimmedText}` },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "OpenAI parse error");
    res.status(500).json({ error: "AI extraction failed. Please try again." });
  }
});

router.post("/itineraries", requireAuth, validate(ItineraryInputSchema), async (req, res): Promise<void> => {
  const { name, countries, region, numDays, difficulty, description, videoUrl, recommendedMonths, priceRange, tags } = req.body;
  const agencyId = req.session.agencyId ?? null;
  const createdBy = req.session.userId ?? null;
  const [itinerary] = await db
    .insert(itinerariesTable)
    .values({ agencyId, createdBy, name, countries: countries ?? [], region, numDays, difficulty, description, videoUrl, recommendedMonths: recommendedMonths ?? [], priceRange: priceRange ?? null, tags: tags ?? [] })
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
  const { dayNumber, cityFrom, cityTo, country, transport, description } = req.body;
  const [day] = await db
    .insert(itineraryDaysTable)
    .values({ itineraryId, dayNumber, cityFrom, cityTo, country, transport, description })
    .returning();
  res.status(201).json({ ...day, createdAt: day.createdAt.toISOString(), hotels: [] });
});

router.patch("/itineraries/:itineraryId/days/:dayId", requireAuth, validate(ItineraryDayUpdateSchema), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { cityFrom, cityTo, country, transport, description, isTransitNight } = req.body;
  const patch: Record<string, unknown> = {};
  if (cityFrom !== undefined) patch.cityFrom = cityFrom;
  if (cityTo !== undefined) patch.cityTo = cityTo;
  if (country !== undefined) patch.country = country;
  if (transport !== undefined) patch.transport = transport;
  if (description !== undefined) patch.description = description;
  if (isTransitNight !== undefined) patch.isTransitNight = isTransitNight;
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
  const { hotelId, segment } = req.body as { hotelId: number; segment: "basic" | "standard" | "premium" };
  if (!hotelId) { res.status(400).json({ error: "hotelId is required" }); return; }

  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, hotelId));
  if (!hotel) { res.status(404).json({ error: "Hotel not found" }); return; }

  const [assignment] = await db
    .insert(itineraryDayHotelsTable)
    .values({ itineraryDayId: dayId, hotelId, segment })
    .returning();

  res.status(201).json(serializeDayHotel({ id: assignment.id, hotelId: assignment.hotelId, hotelName: hotel.name, hotelCity: hotel.city ?? null, hotelAddress: hotel.address ?? null, hotelPhone: hotel.phone ?? null, hotelWebsite: hotel.website ?? null, segment: assignment.segment, createdAt: assignment.createdAt }));
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
           ida.sort_order, ida.start_time, ida.notes, ida.created_at
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
    notes: r.notes ?? null,
    included: true,
    canEdit: true,
    createdAt: String(r.created_at),
  })));
});

router.post("/itineraries/:itineraryId/days/:dayId/activities", requireAuth, validate(ItineraryDayActivityInputSchema), async (req, res): Promise<void> => {
  const dayId = parseInt(Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId, 10);
  const { activityId, sortOrder = 0, notes, startTime } = req.body;

  const insertResult = await db.execute(sql`
    INSERT INTO itinerary_day_activities (day_id, activity_id, sort_order, notes, start_time)
    VALUES (${dayId}, ${activityId}, ${sortOrder}, ${notes ?? null}, ${startTime ?? null})
    RETURNING id, day_id, activity_id, sort_order, notes, start_time, created_at
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
