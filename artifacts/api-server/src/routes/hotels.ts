import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  hotelsTable, itinerariesTable, itineraryDaysTable, itineraryDayHotelsTable,
  tripsTable, tripDaysTable, tripDayHotelsTable,
} from "@workspace/db";
import { requireAuth, requireRoles } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { HotelInputSchema, HotelUpdateSchema, DayHotelInputSchema } from "../lib/schemas";

const router: IRouter = Router();

function serialize(h: typeof hotelsTable.$inferSelect) {
  return { ...h, createdAt: h.createdAt.toISOString() };
}

router.get("/hotels", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  let rows;
  if (role === "admin") {
    rows = await db.select().from(hotelsTable).orderBy(hotelsTable.name);
  } else if (agencyId) {
    rows = await db.select().from(hotelsTable)
      .where(eq(hotelsTable.agencyId, agencyId))
      .orderBy(hotelsTable.name);
  } else {
    rows = await db.select().from(hotelsTable)
      .where(eq(hotelsTable.active, true))
      .orderBy(hotelsTable.name);
  }
  res.json(rows.map(serialize));
});

router.post("/hotels", requireRoles("admin", "manager", "agent", "traveler"), validate(HotelInputSchema), async (req, res): Promise<void> => {
  const { name, city, country, address, phone, website, type, stars, description } = req.body;
  const agencyId = req.session.agencyId ?? undefined;
  const [hotel] = await db
    .insert(hotelsTable)
    .values({ agencyId, name, city, country, address, phone, website, type, stars, description })
    .returning();
  res.status(201).json(serialize(hotel));
});

router.get("/hotels/lookup", requireAuth, async (req, res): Promise<void> => {
  const qRaw = req.query.q;
  const q = (Array.isArray(qRaw) ? String(qRaw[0] ?? "") : String(qRaw ?? "")).trim();
  if (!q) { res.status(400).json({ error: "q is required" }); return; }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;

  if (googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q + " hotel")}&type=lodging&key=${googleKey}`;
      const gRes = await fetch(url);
      const json = await gRes.json() as { results?: Array<{ name: string; formatted_address: string; international_phone_number?: string; website?: string }> };
      const results = (json.results ?? []).slice(0, 6).map(p => {
        const parts = p.formatted_address.split(",").map((s: string) => s.trim());
        const country = parts[parts.length - 1] ?? "";
        const city = parts.length >= 2 ? parts[parts.length - 2].replace(/\d+/g, "").trim() : "";
        return { name: p.name, city, country, address: p.formatted_address, phone: p.international_phone_number ?? "", website: p.website ?? "" };
      });
      res.json(results);
      return;
    } catch (err) {
      req.log.error({ err }, "Google Places lookup error — falling through to Nominatim");
    }
  }

  try {
    type NominatimResult = {
      display_name: string;
      address?: {
        hotel?: string; tourism?: string; amenity?: string;
        house_number?: string; road?: string;
        city?: string; town?: string; village?: string; municipality?: string;
        state?: string; country?: string;
      };
      extratags?: { phone?: string; website?: string; "contact:website"?: string; "contact:phone"?: string };
    };

    const hasLodgingWord = /\b(hotel|hostel|riad|resort|lodge|inn|motel|parador|albergue)\b/i.test(q);
    const queries = hasLodgingWord ? [q] : [`Hotel ${q}`, q];

    const NOM_BASE = "https://nominatim.openstreetmap.org/search";
    const fetchNom = async (searchQ: string) => {
      const r = await fetch(
        `${NOM_BASE}?q=${encodeURIComponent(searchQ)}&format=json&limit=8&addressdetails=1&extratags=1`,
        { headers: { "User-Agent": "Lugendo/1.0 travel-platform" } }
      );
      return r.json() as Promise<NominatimResult[]>;
    };

    const rawSets = await Promise.all(queries.map(fetchNom));
    const allItems: NominatimResult[] = [];
    const seenNames = new Set<string>();
    for (const set of rawSets) {
      for (const item of set) {
        const key = item.display_name.split(",")[0].trim().toLowerCase();
        if (!seenNames.has(key)) { seenNames.add(key); allItems.push(item); }
      }
    }

    const isLodging = (r: NominatimResult) => {
      const cls = (r as unknown as { class?: string }).class ?? "";
      const type = (r as unknown as { type?: string }).type ?? "";
      const addr = r.address ?? {};
      if (addr.hotel ?? addr.tourism ?? addr.amenity) return true;
      if (cls === "tourism" || (cls === "amenity" && type === "hotel")) return true;
      const dl = r.display_name.toLowerCase();
      return /hotel|hostel|riad|resort|inn|lodge|motel|parador|albergue/.test(dl) || type === "hotel";
    };

    const lodging = allItems.filter(isLodging);
    const source = lodging.length > 0 ? lodging : allItems;

    const results = source.slice(0, 6).map(r => {
      const addr = r.address ?? {};
      const name = addr.hotel ?? addr.tourism ?? addr.amenity ?? r.display_name.split(",")[0];
      const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "";
      const country = addr.country ?? "";
      const road = addr.road ? `${addr.house_number ? addr.house_number + " " : ""}${addr.road}` : "";
      const address = [road, city, country].filter(Boolean).join(", ");
      const phone = r.extratags?.phone ?? r.extratags?.["contact:phone"] ?? "";
      const website = r.extratags?.website ?? r.extratags?.["contact:website"] ?? "";
      return { name, city, country, address, phone, website };
    });

    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Nominatim lookup error");
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/hotels/:hotelId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.hotelId) ? req.params.hotelId[0] : req.params.hotelId, 10);
  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, id));
  if (!hotel) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(hotel));
});

router.get("/hotels/:hotelId/usage", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.hotelId) ? req.params.hotelId[0] : req.params.hotelId, 10);
  const itineraries = await db
    .selectDistinct({ id: itinerariesTable.id, name: itinerariesTable.name })
    .from(itineraryDayHotelsTable)
    .innerJoin(itineraryDaysTable, eq(itineraryDayHotelsTable.itineraryDayId, itineraryDaysTable.id))
    .innerJoin(itinerariesTable, eq(itineraryDaysTable.itineraryId, itinerariesTable.id))
    .where(eq(itineraryDayHotelsTable.hotelId, id));
  const trips = await db
    .selectDistinct({ id: tripsTable.id, name: tripsTable.name })
    .from(tripDayHotelsTable)
    .innerJoin(tripDaysTable, eq(tripDayHotelsTable.tripDayId, tripDaysTable.id))
    .innerJoin(tripsTable, eq(tripDaysTable.tripId, tripsTable.id))
    .where(eq(tripDayHotelsTable.hotelId, id));
  res.json({ itineraries, trips });
});

router.patch("/hotels/:hotelId", requireAuth, validate(HotelUpdateSchema), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.hotelId) ? req.params.hotelId[0] : req.params.hotelId, 10);
  const fields = req.body;
  const [hotel] = await db.update(hotelsTable).set(fields).where(eq(hotelsTable.id, id)).returning();
  if (!hotel) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(hotel));
});

router.delete("/hotels/:hotelId", requireRoles("admin"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.hotelId) ? req.params.hotelId[0] : req.params.hotelId, 10);
  await db.delete(hotelsTable).where(eq(hotelsTable.id, id));
  res.sendStatus(204);
});

export default router;
