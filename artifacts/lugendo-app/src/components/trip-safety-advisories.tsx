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
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--noche)" }}>
              {advisory.contentText}
            </p>
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
