// One-off import (tarea #170): scrapes the public "Tourknife" CMS sites of Kananga and
// Ambar Viajes and creates a DRAFT itinerary in Lugendo for every trip found. This is not a
// recurring integrator — after this run, each agency maintains its own itineraries from the
// standard back office. Safe to re-run: itineraries are keyed by sourceUrl (unique in the DB),
// so an already-imported trip is skipped rather than duplicated.
import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, itinerariesTable, itineraryDaysTable } from "@workspace/db";

const ADMIN_USER_ID = 1; // admin@lugendo.io — system user, per tarea #170 scope decision

interface SiteConfig {
  label: string;
  baseUrl: string;
  agencyId: number;
}

const SITES: SiteConfig[] = [
  { label: "Kananga", baseUrl: "https://kananga.com", agencyId: 7 },
  { label: "Ambar Viajes", baseUrl: "https://ambarviajes.com", agencyId: 6 },
];

// The continent-level nav pages (e.g. /viajes-africa) render their trip listing via client-side
// JS/AJAX, so a plain fetch sees no <a href="/viaje/..."> links there at all — useless for
// attribution. Region is derived instead from the per-country nav (which IS server-rendered,
// see discoverAttribution below) via this static lookup, built from both sites' full country menus.
const COUNTRY_TO_REGION: Record<string, string> = {
  "Angola": "África", "Argelia": "África", "Benín": "África", "Botswana": "África",
  "Cabo Verde": "África", "Cataratas Victoria": "África", "Congo Brazzaville": "África",
  "Egipto": "África", "Eswatini (Swaziland)": "África", "Etiopía": "África", "Kenia": "África",
  "Madagascar": "África", "Malawi": "África", "Marruecos": "África", "Mauricio": "África",
  "Namibia": "África", "Rwanda": "África", "Sao Tomé y Príncipe": "África", "Senegal": "África",
  "Sudáfrica": "África", "Tanzania": "África", "Togo": "África", "Uganda": "África",
  "Zambia": "África", "Zanzíbar": "África", "Zimbabwe": "África",
  "Alaska": "América", "Argentina": "América", "Belice": "América", "Bolivia": "América",
  "Brasil": "América", "Chile": "América", "Colombia": "América", "Costa Rica": "América",
  "Cuba": "América", "Ecuador": "América", "El Salvador": "América", "Estados Unidos": "América",
  "Galápagos": "América", "Guatemala": "América", "Honduras": "América", "Panamá": "América",
  "Patagonia": "América", "Perú": "América",
  "Armenia": "Asia", "Bután": "Asia", "Camboya": "Asia", "China": "Asia", "Georgia": "Asia",
  "India": "Asia", "Indonesia": "Asia", "Irak": "Asia", "Japón": "Asia", "Jordania": "Asia",
  "Kirguistán": "Asia", "Laos": "Asia", "Malasia": "Asia", "Mongolia": "Asia", "Nepal": "Asia",
  "Omán": "Asia", "Ruta de la Seda": "Asia", "Sri Lanka": "Asia", "Tailandia": "Asia",
  "Turquía": "Asia", "Uzbekistán": "Asia", "Vietnam": "Asia",
  "Albania": "Europa", "Andorra": "Europa", "Bulgaria": "Europa", "España": "Europa",
  "Chipre": "Europa", "Croacia": "Europa", "Italia": "Europa", "Finlandia": "Europa",
  "Grecia": "Europa", "Groenlandia": "Europa", "Islandia": "Europa", "Islas Feroe": "Europa",
  "Kosovo": "Europa", "Macedonia": "Europa", "Montenegro": "Europa", "Noruega": "Europa",
  "Portugal": "Europa", "Rumanía": "Europa", "Sicilia": "Europa", "Suecia": "Europa",
  "Australia": "Oceanía", "Nueva Zelanda": "Oceanía",
  "Antártida": "Polar", "Ártico": "Polar",
};

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; LugendoImportBot/1.0)" } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// ─── URL discovery ──────────────────────────────────────────────────────────

async function discoverTripUrls(site: SiteConfig): Promise<string[]> {
  const xml = await fetchHtml(`${site.baseUrl}/sitemap.xml`);
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = new Set<string>();
  $("url > loc").each((_, el) => {
    const loc = $(el).text().trim();
    if (loc.includes("/viaje/")) urls.add(loc);
  });
  return [...urls];
}

// Best-effort region/country attribution: crawl the continent + country nav listing pages and
// record which trip slugs they link to. A trip not found in any listing keeps empty countries.
async function discoverAttribution(site: SiteConfig): Promise<{
  countriesByUrl: Map<string, Set<string>>;
  regionByUrl: Map<string, string>;
}> {
  const countriesByUrl = new Map<string, Set<string>>();
  const regionByUrl = new Map<string, string>();

  // Kananga names its country listing pages "/viajes/{slug}-{id}" and uses "/viajar/{slug}"
  // (no id) for curated theme pages; Ambar Viajes does the exact opposite (country pages are
  // "/viajar/{slug}-{id}"). Accept both prefixes as long as they end in "-{numeric id}", and
  // when the same href shows up under more than one link text (nav menu vs. a "Lo más buscado"
  // teaser card, e.g. "Sudáfrica" vs. "Viaje Sudáfrica"), keep the shortest text as the
  // canonical country name.
  const home$ = cheerio.load(await fetchHtml(site.baseUrl));
  const countryNameByHref = new Map<string, string>();
  home$("a[href]").each((_, el) => {
    const href = home$(el).attr("href") ?? "";
    const text = home$(el).text().trim();
    const m = href.match(/^\/(?:viajes|viajar)\/[a-z0-9-]+-\d+$/i);
    if (!m || !text) return;
    const current = countryNameByHref.get(href);
    if (!current || text.length < current.length) countryNameByHref.set(href, text);
  });

  for (const [href, countryName] of countryNameByHref) {
    // "Lo más buscado" teaser links reuse the same "/viajes|viajar/{slug}-{id}" URL shape for
    // landmarks/parks (e.g. "Reserva Masai Mara"), not just countries. COUNTRY_TO_REGION is
    // also the authoritative allowlist of real country names, so skip anything not in it.
    const region = COUNTRY_TO_REGION[countryName];
    if (!region) continue;
    try {
      const country$ = cheerio.load(await fetchHtml(`${site.baseUrl}${href}`));
      country$('a[href^="/viaje/"]').each((_, el) => {
        const tripHref = country$(el).attr("href") ?? "";
        const url = `${site.baseUrl}${tripHref}`;
        if (!countriesByUrl.has(url)) countriesByUrl.set(url, new Set());
        countriesByUrl.get(url)!.add(countryName);
        if (!regionByUrl.has(url)) regionByUrl.set(url, region);
      });
    } catch (err) {
      console.warn(`  [warn] no se pudo leer listado de país ${href}: ${(err as Error).message}`);
    }
  }

  return { countriesByUrl, regionByUrl };
}

// ─── Trip page parsing ──────────────────────────────────────────────────────

interface ParsedDay {
  title: string;
  cityFrom: string | null;
  cityTo: string | null;
  description: string;
}

interface ParsedTrip {
  name: string;
  numDays: number | null;
  isGroupTrip: boolean;
  priceFrom: number | null;
  priceRangeText: string | null;
  description: string | null;
  recommendations: string[];
  tripNotes: string[];
  days: ParsedDay[];
  imageUrls: string[];
}

function cleanText(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

const TITLE_LOWERCASE_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "en", "a", "con", "al"]);
function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i > 0 && TITLE_LOWERCASE_WORDS.has(word)) return word;
      return word.replace(/(^|-)([a-záéíóúñ])/g, (_m, sep, ch) => sep + ch.toUpperCase());
    })
    .join(" ");
}

function parsePrice(text: string): number | null {
  const digits = text.trim().replace(/\./g, "").replace(",", ".");
  const value = Math.round(parseFloat(digits));
  return Number.isFinite(value) ? value : null;
}

// Both sites are the same "Tourknife" CMS and expose a schema.org Product/Offer markup that is
// far more reliable to parse than free text: meta[itemprop=description] carries the full
// description HTML (narrative paragraphs + highlight bullets), link[itemprop=image] is the
// canonical photo gallery, and #collapseItinerary holds one <h4 class="dayTitle"> + sibling
// <div class="format_free_text"> pair per day.
function parseTrip(html: string): ParsedTrip {
  const $ = cheerio.load(html);

  const name = cleanText($("h1.h1tourTitle").first().text()) || cleanText($('meta[itemprop="name"]').attr("content") ?? "");

  let numDays: number | null = null;
  let isGroupTrip = true;
  $(".tour_highlight_item").each((_, el) => {
    const t = cleanText($(el).text());
    const daysMatch = t.match(/(\d+)\s*d[ií]as/i);
    if (daysMatch) numDays = parseInt(daysMatch[1], 10);
    if (/a medida/i.test(t)) isGroupTrip = false;
  });

  const priceText = $('[itemprop="price"]').first().text();
  const priceFrom = priceText ? parsePrice(priceText) : null;
  const priceRangeText = priceFrom != null ? `desde ${priceFrom} €` : null;

  const descriptionHtml = $('meta[itemprop="description"]').attr("content") ?? "";
  const desc$ = cheerio.load(descriptionHtml);
  const descParagraphs = desc$("p")
    .map((_, el) => cleanText(desc$(el).text()))
    .get()
    .filter(t => t.length > 0);
  const description = descParagraphs.length > 0 ? descParagraphs.join("\n\n") : null;
  const recommendations = desc$("li")
    .map((_, el) => cleanText(desc$(el).text()))
    .get()
    .filter(t => t.length > 0);

  // Includes / excludes: two ".one_half" blocks inside #includedOrNot, each a <dl> with a
  // <dt> label (INCLUYE:/NO INCLUYE:) followed by either <p> or <ul><li> content.
  const tripNotes: string[] = [];
  const includeBlocks = $("#includedOrNot .one_half");
  const includeBlock = includeBlocks.eq(0);
  const excludeBlock = includeBlocks.eq(1);
  const blockText = (block: cheerio.Cheerio<any>): string => {
    const clone = block.clone();
    clone.find("dt").remove();
    return cleanText(clone.text()).replace(/\n+/g, " ").trim();
  };
  if (includeBlock.length > 0) {
    const t = blockText(includeBlock);
    if (t) tripNotes.push(`Incluye: ${t}`);
  }
  if (excludeBlock.length > 0) {
    const t = blockText(excludeBlock);
    if (t) tripNotes.push(`No incluye: ${t}`);
  }

  const days: ParsedDay[] = [];
  $("#collapseItinerary h4.dayTitle").each((_, el) => {
    const rawTitle = cleanText($(el).text()).replace(/^DÍA\s*\d+\s*[.\-–:]?\s*/i, "");
    const body = cleanText($(el).next(".format_free_text").text());
    const parts = rawTitle.split(/\s*[–-]\s*/).map(p => p.trim()).filter(Boolean);
    const cityFrom = parts.length > 1 ? toTitleCase(parts[0]) : null;
    const cityTo = toTitleCase(parts[parts.length - 1] ?? rawTitle);
    days.push({ title: toTitleCase(rawTitle), cityFrom, cityTo, description: body });
  });

  const imageUrls = $('link[itemprop="image"]')
    .map((_, el) => $(el).attr("href"))
    .get()
    .filter((href): href is string => Boolean(href));

  return {
    name,
    numDays,
    isGroupTrip,
    priceFrom,
    priceRangeText,
    description,
    recommendations: [...new Set(recommendations)].slice(0, 8),
    tripNotes,
    days,
    imageUrls: [...new Set(imageUrls)],
  };
}

// ─── Image download + re-upload to R2 ──────────────────────────────────────

async function downloadAndReupload(imageUrl: string, folder: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/webp";
    const ext = imageUrl.match(/\.(webp|jpe?g|png)$/i)?.[0] ?? ".jpg";
    const objectId = randomUUID();
    const key = `public/${folder}/${objectId}${ext}`;
    await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType }));
    return `/api/storage/public-objects/${folder}/${objectId}${ext}`;
  } catch (err) {
    console.warn(`    [warn] no se pudo descargar/subir imagen ${imageUrl}: ${(err as Error).message}`);
    return null;
  }
}

// ─── Main import ────────────────────────────────────────────────────────────

interface ImportResult {
  site: string;
  imported: number;
  skippedExisting: number;
  failed: { url: string; reason: string }[];
}

async function importSite(site: SiteConfig): Promise<ImportResult> {
  console.log(`\n=== ${site.label} (${site.baseUrl}) ===`);
  const result: ImportResult = { site: site.label, imported: 0, skippedExisting: 0, failed: [] };

  const discovered = await discoverTripUrls(site);
  const limit = process.env.IMPORT_LIMIT ? parseInt(process.env.IMPORT_LIMIT, 10) : undefined;
  const tripUrls = limit ? discovered.slice(0, limit) : discovered;
  console.log(`  ${discovered.length} URLs de viaje encontradas en el sitemap${limit ? ` (procesando solo las primeras ${limit})` : ""}`);

  const { countriesByUrl, regionByUrl } = await discoverAttribution(site);

  for (const url of tripUrls) {
    const [existing] = await db.select({ id: itinerariesTable.id }).from(itinerariesTable).where(eq(itinerariesTable.sourceUrl, url));
    if (existing) {
      result.skippedExisting++;
      continue;
    }

    try {
      console.log(`  -> ${url}`);
      const html = await fetchHtml(url);
      const trip = parseTrip(html);

      if (!trip.name || trip.days.length === 0) {
        throw new Error(`parseo insuficiente (name="${trip.name}", days=${trip.days.length})`);
      }

      const countries = [...(countriesByUrl.get(url) ?? [])];
      const region = regionByUrl.get(url) ?? null;

      // Re-upload gallery images before touching the DB, then round-robin them across days so
      // day 1 (used as the public cover photo elsewhere in the app) always gets one when available.
      const folder = `itinerary-photos/${site.label === "Kananga" ? "kananga" : "ambar-viajes"}`;
      const reuploaded: string[] = [];
      for (const imgUrl of trip.imageUrls.slice(0, 12)) {
        const uploaded = await downloadAndReupload(imgUrl, folder);
        if (uploaded) reuploaded.push(uploaded);
      }

      // Itinerary + its days are written atomically: if the process dies partway through, a
      // re-run finds no row for this sourceUrl yet and retries the whole trip from scratch
      // instead of resuming a half-populated itinerary.
      await db.transaction(async tx => {
        const [itinerary] = await tx.insert(itinerariesTable).values({
          agencyId: site.agencyId,
          createdBy: ADMIN_USER_ID,
          name: trip.name,
          countries,
          region,
          numDays: trip.numDays ?? trip.days.length,
          description: trip.description,
          priceRange: trip.priceRangeText,
          priceFrom: trip.priceFrom,
          tags: trip.isGroupTrip ? ["viaje en grupo"] : ["a medida"],
          tripNotes: trip.tripNotes,
          recommendations: trip.recommendations,
          active: false,
          publishedInSearch: false,
          sourceUrl: url,
        }).returning({ id: itinerariesTable.id });

        for (let i = 0; i < trip.days.length; i++) {
          const day = trip.days[i];
          const photoUrl = reuploaded.length > 0 ? reuploaded[i % reuploaded.length] : null;
          await tx.insert(itineraryDaysTable).values({
            itineraryId: itinerary.id,
            dayNumber: i + 1,
            cityFrom: day.cityFrom,
            cityTo: day.cityTo,
            description: `${day.title}\n\n${day.description}`.trim(),
            photoUrl,
          });
        }
      });

      result.imported++;
      console.log(`     OK: "${trip.name}" (${trip.days.length} días, ${reuploaded.length} fotos)`);
    } catch (err) {
      const reason = (err as Error).message;
      console.error(`     FALLÓ: ${reason}`);
      result.failed.push({ url, reason });
    }
  }

  return result;
}

async function main() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error("Faltan variables R2_* en el entorno (se cargan desde artifacts/api-server/.env)");
  }

  const results: ImportResult[] = [];
  for (const site of SITES) {
    results.push(await importSite(site));
  }

  console.log("\n=== Resumen ===");
  for (const r of results) {
    console.log(`${r.site}: ${r.imported} importados, ${r.skippedExisting} ya existentes (omitidos), ${r.failed.length} fallidos`);
    for (const f of r.failed) console.log(`  - ${f.url}: ${f.reason}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
