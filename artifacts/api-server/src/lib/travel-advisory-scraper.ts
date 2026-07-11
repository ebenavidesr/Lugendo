import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";
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

export interface AdvisorySection {
  heading: string;
  html: string;
}

export interface ScrapedAdvisory {
  // JSON-encoded AdvisorySection[] when the page's accordion (Documentación y visados, Seguridad,
  // Sanidad, etc.) was found; falls back to a single plain-text blob otherwise. The frontend must
  // try JSON.parse and fall back to rendering the raw string for older cached rows / this fallback path.
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

// The Ministry's country pages render the actual advisory content (Documentación y visados,
// Seguridad, Sanidad, Divisas, Otros, Direcciones y teléfonos de interés...) as an accordion:
// a run of `h3.accordion__main` headings each immediately followed by a `.single__text.panel`
// content block. The legacy PRIMARY_SELECTORS below only ever matched the generic "Aviso general"
// disclaimer shown above the accordion (present on every country page), so the previous scraper
// never actually reached the country-specific sections travelers care about.
const ACCORDION_HEADING_SELECTOR = "h3.accordion__main";

// Block/inline tags kept as-is; everything else is stripped but its text content is preserved
// (sanitize-html default behavior for disallowed tags is to unwrap, not delete).
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "div", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a", "blockquote"],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }, true),
  },
  // Strips paragraphs/divs left empty after sanitization -- the source HTML has plenty
  // (spacer divs, zero-width-space/nbsp-only <p>s used for visual gaps in the original SharePoint markup).
  exclusiveFilter: (frame) =>
    (frame.tag === "p" || frame.tag === "div") && !frame.text.replace(/[\s\u200b\u00a0]/g, "").trim(),
};

function extractSections($: cheerio.CheerioAPI): AdvisorySection[] {
  const sections: AdvisorySection[] = [];
  $(ACCORDION_HEADING_SELECTOR).each((_, headingEl) => {
    const heading = $(headingEl).text().trim();
    const panel = $(headingEl).next();
    if (!heading || panel.length === 0) return;
    const html = sanitizeHtml(panel.html() ?? "", SANITIZE_OPTIONS).trim();
    if (html) sections.push({ heading, html });
  });
  return sections;
}

// Fallback selectors for pages where the accordion structure above isn't found (unexpected
// markup change, or a country page that genuinely only has the generic disclaimer). Kept as a
// plain-text extraction so the feature degrades instead of failing outright.
const FALLBACK_SELECTORS = [".single__textDetalleRV", ".single__text.panel", "#DeltaPlaceHolderMain"];

function extractFallbackText($: cheerio.CheerioAPI): string {
  for (const selector of FALLBACK_SELECTORS) {
    const el = $(selector).first();
    if (el.length > 0) {
      const text = cleanText(el.text());
      if (text.length > 0) return text;
    }
  }
  return cleanText($("body").text());
}

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
  const bodyText = cleanText($("body").text());

  const sections = extractSections($);
  let contentText: string;
  if (sections.length > 0) {
    contentText = JSON.stringify(sections);
  } else {
    const fallback = extractFallbackText($);
    if (!fallback) throw new TravelAdvisoryScrapeError(`No parseable content found at ${url}`);
    contentText = fallback;
  }

  return {
    contentText,
    contentHash: computeContentHash(contentText),
    officialUpdatedAt: extractOfficialUpdatedAt(bodyText),
  };
}
