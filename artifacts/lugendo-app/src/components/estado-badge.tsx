import { cn } from "@/lib/utils";

/**
 * Paleta semántica formalizada en #176 (auditoría UX/UI): además de los tonos
 * de marca (índigo, duna), se usan 3 colores ajenos a la guía pero ya en uso
 * y confirmados por hex exacto — éxito (verde), aviso (ámbar), peligro (rojo).
 * Sus variables (--green/--amber/--red + "-light") ya existían en index.css.
 */
export type EstadoTone = "indigo" | "duna" | "green" | "amber" | "red" | "muted" | "terra";

const TONE_STYLES: Record<EstadoTone, { bg: string; color: string; bgOnDark: string; colorOnDark: string }> = {
  indigo: { bg: "var(--indigo-light)", color: "var(--indigo)", bgOnDark: "rgba(255,255,255,0.15)", colorOnDark: "var(--duna)" },
  duna:   { bg: "var(--duna)",         color: "var(--text-sec)", bgOnDark: "rgba(255,255,255,0.15)", colorOnDark: "var(--duna)" },
  green:  { bg: "var(--green-light)",  color: "var(--green)",   bgOnDark: "rgba(76,175,80,0.25)",  colorOnDark: "#A5D6A7" },
  amber:  { bg: "var(--amber-light)",  color: "var(--amber)",   bgOnDark: "rgba(255,193,7,0.25)",  colorOnDark: "#FFD54F" },
  red:    { bg: "var(--red-light)",    color: "var(--red)",     bgOnDark: "rgba(244,67,54,0.25)",  colorOnDark: "#EF9A9A" },
  muted:  { bg: "var(--lg-border)",    color: "var(--text-ter)", bgOnDark: "rgba(255,255,255,0.15)", colorOnDark: "var(--duna)" },
  terra:  { bg: "var(--terra-light)",  color: "var(--ocre)",    bgOnDark: "rgba(255,255,255,0.15)", colorOnDark: "var(--duna)" },
};

interface EstadoBadgeProps {
  label: string;
  tone: EstadoTone;
  /** Para usar sobre fondos oscuros/de color sólido (p.ej. la cabecera índigo del viaje del viajero). */
  onDark?: boolean;
  className?: string;
}

/**
 * Badge de estado/rol único (#176) — mismo padding/radius/tipografía en Itinerarios,
 * Hoteles, Viajes, Equipo, Agencias y el detalle de viaje del viajero, en vez de las
 * 6+ implementaciones independientes que había antes.
 */
export function EstadoBadge({ label, tone, onDark = false, className }: EstadoBadgeProps) {
  const s = TONE_STYLES[tone];
  return (
    <span
      className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium", className)}
      style={{ background: onDark ? s.bgOnDark : s.bg, color: onDark ? s.colorOnDark : s.color }}
    >
      {label}
    </span>
  );
}
