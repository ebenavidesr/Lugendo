import * as cheerio from "cheerio";
import { createHash } from "crypto";

const ADVISORY_BASE_URL = "https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/Detalle-recomendaciones-de-viaje.aspx";

// The Ministry site keys its pages by country name (`trc` query param), which does not always
// match the exact Spanish name our app stores on trips/itineraries (accents, alternate
// spellings, official vs. common names). Only add an entry here when the country name used
// across the app (see `lib/api-client-react/src/countries.ts`) does not work as-is against
// the Ministry site.
const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  "Corea del Sur": "Corea (República de)",
  "Corea del Norte": "Corea (República Popular Democrática de)",
  "República Democrática del Congo": "Congo (República Democrática del)",
  "Ciudad del Vaticano": "Santa Sede",
};

export function buildAdvisoryUrl(countryName: string): string {
  const trc = COUNTRY_NAME_OVERRIDES[countryName] ?? countryName;
  const url = new URL(ADVISORY_BASE_URL);
  url.searchParams.set("trc", trc);
  return url.toString();
}

export interface ScrapedAdvisory {
  contentText: string;
  contentHash: string;
  officialUpdatedAt: string | null;
}

export class TravelAdvisoryScrapeError extends Error {}

const LAST_UPDATED_PATTERN = /Última actualización[^0-9]*(\d{1,2} de [a-zA-Zé]+ de \d{4})/i;

function extractOfficialUpdatedAt(text: string): string | null {
  const match = text.match(LAST_UPDATED_PATTERN);
  return match ? match[1] : null;
}

function computeContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join("\n")
    .trim();
}

// Primary selector matches the Ministry's single-article content block used on their
// country detail pages. Fallback selectors are broader "main content" containers used
// in case the primary markup changes; if neither is found, we still capture whatever
// readable body text exists rather than failing the whole refresh outright.
const PRIMARY_SELECTORS = [".single__textDetalleRV", ".single__text.panel", "#DeltaPlaceHolderMain"];

export async function scrapeCountryAdvisory(countryName: string): Promise<ScrapedAdvisory> {
  const url = buildAdvisoryUrl(countryName);

  let html: string;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LugendoBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new TravelAdvisoryScrapeError(`HTTP ${response.status} fetching ${url}`);
    }
    html = await response.text();
  } catch (err) {
    if (err instanceof TravelAdvisoryScrapeError) throw err;
    throw new TravelAdvisoryScrapeError(`Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const $ = cheerio.load(html);

  let contentText = "";
  for (const selector of PRIMARY_SELECTORS) {
    const el = $(selector).first();
    if (el.length > 0) {
      const text = cleanText(el.text());
      if (text.length > 0) {
        contentText = text;
        break;
      }
    }
  }

  if (!contentText) {
    const bodyText = cleanText($("body").text());
    if (!bodyText) {
      throw new TravelAdvisoryScrapeError(`No parseable content found at ${url}`);
    }
    contentText = bodyText;
  }

  return {
    contentText,
    contentHash: computeContentHash(contentText),
    officialUpdatedAt: extractOfficialUpdatedAt(contentText),
  };
}
