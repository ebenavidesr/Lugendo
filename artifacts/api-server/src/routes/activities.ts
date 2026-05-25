import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
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

// ── Activity lookup (Nominatim / Google Places) ───────────────────────────────
router.get("/activities/lookup", requireAuth, async (req, res): Promise<void> => {
  const qRaw = req.query.q;
  const q = (Array.isArray(qRaw) ? String(qRaw[0] ?? "") : String(qRaw ?? "")).trim();
  if (!q) { res.status(400).json({ error: "q is required" }); return; }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;

  // ── Google Places (if key configured) ────────────────────────────────────
  if (googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&type=tourist_attraction|point_of_interest|museum|park&key=${googleKey}`;
      const gRes = await fetch(url);
      const json = await gRes.json() as { results?: Array<{ name: string; formatted_address: string; website?: string }> };
      const results = (json.results ?? []).slice(0, 6).map(p => {
        const parts = p.formatted_address.split(",").map((s: string) => s.trim());
        const country = parts[parts.length - 1] ?? "";
        const city = parts.length >= 2 ? parts[parts.length - 2].replace(/\d+/g, "").trim() : "";
        return { name: p.name, city, country, address: p.formatted_address, description: "" };
      });
      res.json(results);
      return;
    } catch (err) {
      req.log.error({ err }, "Google Places activity lookup error — falling through to Nominatim");
    }
  }

  // ── OpenStreetMap Nominatim (free, no key required) ───────────────────────
  try {
    type NominatimResult = {
      display_name: string;
      address?: {
        tourism?: string; amenity?: string; leisure?: string;
        historic?: string; natural?: string; attraction?: string;
        house_number?: string; road?: string;
        city?: string; town?: string; village?: string; municipality?: string;
        state?: string; country?: string;
      };
      extratags?: {
        description?: string; website?: string;
        "contact:website"?: string;
        wikipedia?: string;
      };
    };

    const NOM_BASE = "https://nominatim.openstreetmap.org/search";
    const fetchNom = async (searchQ: string) => {
      const r = await fetch(
        `${NOM_BASE}?q=${encodeURIComponent(searchQ)}&format=json&limit=8&addressdetails=1&extratags=1`,
        { headers: { "User-Agent": "Lugendo/1.0 travel-platform" } }
      );
      return r.json() as Promise<NominatimResult[]>;
    };

    const rawSets = await Promise.all([q, `tourism ${q}`].map(fetchNom));
    const allItems: NominatimResult[] = [];
    const seenNames = new Set<string>();
    for (const set of rawSets) {
      for (const item of set) {
        const key = item.display_name.split(",")[0].trim().toLowerCase();
        if (!seenNames.has(key)) { seenNames.add(key); allItems.push(item); }
      }
    }

    const isActivity = (r: NominatimResult) => {
      const cls = (r as unknown as { class?: string }).class ?? "";
      const type = (r as unknown as { type?: string }).type ?? "";
      const addr = r.address ?? {};
      if (addr.tourism ?? addr.amenity ?? addr.leisure ?? addr.historic ?? addr.natural ?? addr.attraction) return true;
      if (["tourism", "leisure", "amenity", "historic", "natural"].includes(cls)) return true;
      const dl = r.display_name.toLowerCase();
      return /museum|park|monument|temple|castle|cathedral|theatre|theater|attraction|gallery|zoo|aquarium|plaza|square|beach|garden|market|tour/.test(dl) || type === "attraction";
    };

    const activities = allItems.filter(isActivity);
    const source = activities.length > 0 ? activities : allItems;

    const results = source.slice(0, 6).map(r => {
      const addr = r.address ?? {};
      const name = addr.tourism ?? addr.amenity ?? addr.leisure ?? addr.historic ?? addr.natural ?? addr.attraction ?? r.display_name.split(",")[0];
      const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "";
      const country = addr.country ?? "";
      const road = addr.road ? `${addr.house_number ? addr.house_number + " " : ""}${addr.road}` : "";
      const address = [road, city, country].filter(Boolean).join(", ");
      const description = r.extratags?.description ?? "";
      return { name, city, country, address, description };
    });

    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Nominatim activity lookup error");
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/activities", requireAuth, async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const rows = role === "admin"
    ? await db.select().from(activitiesTable).orderBy(activitiesTable.name)
    : agencyId
      ? await db.select().from(activitiesTable).where(eq(activitiesTable.agencyId, agencyId)).orderBy(activitiesTable.name)
      : [];
  res.json(rows.map(serialize));
});

router.post("/activities", requireAuth, async (req, res): Promise<void> => {
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

router.get("/activities/:activityId/usage", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId, 10);
  const result = await db.execute(sql`
    SELECT DISTINCT i.id, i.name
    FROM itinerary_day_activities ida
    JOIN itinerary_days idys ON idys.id = ida.day_id
    JOIN itineraries i ON i.id = idys.itinerary_id
    WHERE ida.activity_id = ${id}
  `);
  res.json({ itineraries: result.rows });
});

router.get("/activities/:activityId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId, 10);
  const [activity] = await db.select().from(activitiesTable).where(eq(activitiesTable.id, id));
  if (!activity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(activity));
});

router.patch("/activities/:activityId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId, 10);
  const fields = req.body;
  const [activity] = await db.update(activitiesTable).set(fields).where(eq(activitiesTable.id, id)).returning();
  if (!activity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(activity));
});

router.delete("/activities/:activityId", requireRoles("admin", "manager"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.activityId) ? req.params.activityId[0] : req.params.activityId, 10);
  await db.delete(activitiesTable).where(eq(activitiesTable.id, id));
  res.status(204).send();
});

export default router;
