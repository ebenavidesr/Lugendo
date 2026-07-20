import { ShieldCheck, AlertTriangle, ExternalLink, Smartphone, Globe } from "lucide-react";
import type { TripTravelAdvisoriesResponse } from "@workspace/api-client-react";

const MAUC_APP_STORE_URL = "https://apps.apple.com/es/app/mauc/id1344589254";
const MAUC_GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=es.maec.mauc";

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TripSafetyAdvisoriesProps {
  data: TripTravelAdvisoriesResponse | undefined;
  isLoading: boolean;
  showMaucPromo?: boolean;
}

interface AdvisorySection {
  heading: string;
  html: string;
}

// contentText is either a JSON-encoded AdvisorySection[] (current scraper: one section per
// Ministry accordion tab — Documentación y visados, Seguridad, Sanidad, etc.) or a legacy plain
// text blob from before that format existed. Rows refresh on their own schedule (up to ~20h), so
// both shapes can be in the DB at once — fall back to plain text when it isn't a valid section array.
function parseAdvisorySections(contentText: string): AdvisorySection[] | null {
  try {
    const parsed: unknown = JSON.parse(contentText);
    if (Array.isArray(parsed) && parsed.every(s => typeof s?.heading === "string" && typeof s?.html === "string")) {
      return parsed as AdvisorySection[];
    }
  } catch {
    // Not JSON — legacy plain-text row.
  }
  return null;
}

function AdvisoryContent({ contentText }: { contentText: string }) {
  const sections = parseAdvisorySections(contentText);

  if (!sections) {
    return (
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--noche)" }}>
        {contentText}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map(section => (
        <div key={section.heading}>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--indigo)" }}>
            {section.heading}
          </p>
          {/* html comes pre-sanitized server-side (sanitize-html, allowlisted tags only) by the
              Ministry scraper — this field is never written from user input, only from that job. */}
          <div
            className="text-[13px] leading-relaxed [&_p]:mb-2 [&_div]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_li]:mb-1 [&_a]:underline [&_strong]:font-semibold last:[&>*]:mb-0"
            style={{ color: "var(--noche)" }}
            dangerouslySetInnerHTML={{ __html: section.html }}
          />
        </div>
      ))}
    </div>
  );
}

export function TripSafetyAdvisories({ data, isLoading, showMaucPromo = false }: TripSafetyAdvisoriesProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-24 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!data || !data.international) {
    return (
      <div className="bg-card border border-border rounded-[14px] p-8 text-center">
        <ShieldCheck className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--terra)" }} />
        <p className="text-sm text-muted-foreground">
          Esta sección sólo tiene contenido para viajes fuera de España.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.advisories.map(advisory => (
        <div key={advisory.countryName} className="bg-card border border-border rounded-[14px] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" style={{ color: "var(--indigo)" }} />
              <p className="text-[13px] font-semibold" style={{ color: "var(--noche)" }}>{advisory.countryName}</p>
            </div>
            <a
              href={advisory.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              Fuente oficial
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {advisory.changed && (
            <div
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-medium"
              style={{ background: "rgba(196,121,58,0.12)", color: "var(--terra)" }}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Han cambiado las recomendaciones oficiales desde tu última consulta
            </div>
          )}

          {advisory.contentText ? (
            <AdvisoryContent contentText={advisory.contentText} />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Todavía no se ha podido obtener el contenido oficial para este país.
            </p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground">
            {advisory.officialUpdatedAt && (
              <span>Última actualización oficial: {advisory.officialUpdatedAt}</span>
            )}
            {advisory.lastCheckedAt && (
              <span>Comprobado: {fmtDateTime(advisory.lastCheckedAt)}</span>
            )}
          </div>
        </div>
      ))}

      {showMaucPromo && (
        <div className="bg-card border border-border rounded-[14px] p-4 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
              Regístrate en la app MAUC del Ministerio
            </p>
          </div>
          <p className="text-[12px] text-muted-foreground">
            La app "Viajeros Registrados" (MAUC) del Ministerio de Asuntos Exteriores te permite recibir alertas de seguridad y asistencia consular durante tu viaje.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={MAUC_APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12px] font-medium border border-border hover:bg-muted/40 transition-colors"
              style={{ color: "var(--indigo)" }}
            >
              App Store
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={MAUC_GOOGLE_PLAY_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12px] font-medium border border-border hover:bg-muted/40 transition-colors"
              style={{ color: "var(--indigo)" }}
            >
              Google Play
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
