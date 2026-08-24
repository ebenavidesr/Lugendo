import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  sub?: string;
  /** Fondo del recuadro de icono (solo variante "default"). */
  accent?: string;
  /** Color del icono. */
  iconColor?: string;
  /** Color del valor (solo variante "compact" — p.ej. para KPIs con color dinámico según ratio). */
  valueColor?: string;
  /**
   * "default": tarjeta amplia (icono en recuadro a la derecha, etiqueta arriba, valor grande debajo) —
   * usada en grids de 2-4 columnas (Dashboard, perfil del viajero).
   * "compact": tarjeta densa (icono centrado arriba, valor, etiqueta pequeña debajo, sin recuadro) —
   * usada en tiras de 5+ KPIs (detalle de viaje del viajero).
   */
  variant?: "default" | "compact";
}

export function StatCard({ label, value, icon: Icon, sub, accent, iconColor, valueColor, variant = "default" }: StatCardProps) {
  if (variant === "compact") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-border p-3 text-center"
        style={{ background: "#F5EFE6" }}
      >
        <Icon className="w-4 h-4" style={{ color: iconColor ?? "var(--terra)" }} />
        <p className="text-[16px] font-semibold leading-none" style={{ color: valueColor ?? "var(--indigo)" }}>
          {value}
        </p>
        <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-[14px] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-[32px] font-medium leading-none mt-1.5" style={{ color: "#2D1F0E" }}>{value}</p>
          {sub && <p className="text-xs mt-1 text-muted-foreground">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: accent ?? "#FAEEE4" }}>
          <Icon className="w-4.5 h-4.5" style={{ color: iconColor ?? "#C4793A" }} />
        </div>
      </div>
    </div>
  );
}
