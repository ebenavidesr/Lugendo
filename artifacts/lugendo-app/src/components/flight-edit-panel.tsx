import { useState } from "react";
import { Plane, Plus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface FlightLeg {
  airline: string;
  flightNumber: string;
  cityFrom: string;
  cityTo: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  reservationCode: string;
}

export const emptyLeg = (): FlightLeg => ({
  airline: "", flightNumber: "", cityFrom: "", cityTo: "",
  date: "", departureTime: "", arrivalTime: "", reservationCode: "",
});

interface FlightEditPanelProps {
  outboundFlights: FlightLeg[];
  returnFlights: FlightLeg[];
  onSave: (data: { outboundFlights: FlightLeg[]; returnFlights: FlightLeg[] }) => Promise<void>;
  readOnly?: boolean;
}

function formatDate(date: string): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function flightSummary(legs: FlightLeg[]): string {
  if (!legs.length) return "—";
  const first = legs[0];
  const parts: string[] = [];
  if (first.cityFrom || first.cityTo) parts.push([first.cityFrom, first.cityTo].filter(Boolean).join(" → "));
  if (first.date) parts.push(formatDate(first.date));
  const times = [first.departureTime, first.arrivalTime].filter(Boolean).join(" – ");
  if (times) parts.push(times);
  return parts.join(" · ") || "—";
}

function LegForm({
  legs,
  outboundColor,
  onChange,
}: {
  legs: FlightLeg[];
  outboundColor: boolean;
  onChange: (legs: FlightLeg[]) => void;
}) {
  const accent = outboundColor ? "#C4793A" : "#3D2F6B";
  const bgAccent = outboundColor ? "#FAEEE4" : "#EAE6F5";

  const update = (idx: number, patch: Partial<FlightLeg>) => {
    onChange(legs.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  return (
    <div className="space-y-3">
      {legs.map((leg, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="flex items-center justify-between py-2 border-t border-border/60">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Tramo {idx + 1}</span>
              <button
                type="button"
                onClick={() => onChange(legs.filter((_, i) => i !== idx))}
                className="text-[11px] text-red-500 hover:underline"
              >
                Eliminar
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Aerolínea</label>
              <Input className="h-8 text-[13px]" placeholder="Iberia" value={leg.airline} onChange={e => update(idx, { airline: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Nº vuelo</label>
              <Input className="h-8 text-[13px]" placeholder="IB1234" value={leg.flightNumber} onChange={e => update(idx, { flightNumber: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Origen</label>
              <Input className="h-8 text-[13px]" placeholder="Madrid" value={leg.cityFrom} onChange={e => update(idx, { cityFrom: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Destino</label>
              <Input className="h-8 text-[13px]" placeholder="Tokio" value={leg.cityTo} onChange={e => update(idx, { cityTo: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] text-muted-foreground">Fecha</label>
              <Input className="h-8 text-[13px]" type="date" value={leg.date} onChange={e => update(idx, { date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Salida</label>
              <Input className="h-8 text-[13px]" type="time" value={leg.departureTime} onChange={e => update(idx, { departureTime: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Llegada</label>
              <Input className="h-8 text-[13px]" type="time" value={leg.arrivalTime} onChange={e => update(idx, { arrivalTime: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] text-muted-foreground">Código reserva</label>
              <Input className="h-8 text-[13px]" placeholder="ABCDEF" value={leg.reservationCode} onChange={e => update(idx, { reservationCode: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...legs, emptyLeg()])}
        className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors"
        style={{ background: bgAccent, color: accent }}
      >
        <Plus className="w-3 h-3" /> Añadir tramo
      </button>
    </div>
  );
}

export function FlightEditPanel({ outboundFlights, returnFlights, onSave, readOnly = false }: FlightEditPanelProps) {
  const hasAnyFlight = outboundFlights.length > 0 || returnFlights.length > 0;
  const [open, setOpen] = useState(!hasAnyFlight);
  const [outbound, setOutbound] = useState<FlightLeg[]>(outboundFlights);
  const [ret, setRet] = useState<FlightLeg[]>(returnFlights);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleOpenEdit = () => {
    if (readOnly) return;
    setOutbound(outboundFlights.length ? outboundFlights : [emptyLeg()]);
    setRet(returnFlights.length ? returnFlights : [emptyLeg()]);
    setEditing(true);
    setOpen(true);
  };

  const handleCancel = () => {
    setEditing(false);
    if (!hasAnyFlight) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        outboundFlights: outbound.filter(l => l.airline || l.flightNumber),
        returnFlights: ret.filter(l => l.airline || l.flightNumber),
      });
      setEditing(false);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const outSummary = flightSummary(outboundFlights);
  const retSummary = flightSummary(returnFlights);

  return (
    <div className="bg-card border border-border rounded-[14px] overflow-hidden">
      <div className="w-full flex items-center gap-3 px-5 py-3.5">
        <Plane className="w-4 h-4 shrink-0" style={{ color: "#C4793A" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Vuelos</p>
          {hasAnyFlight ? (
            <div className="mt-0.5 space-y-0.5">
              {outboundFlights.length > 0 && (
                <p className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                  <span className="text-[11px] text-muted-foreground mr-1">Ida:</span>{outSummary}
                </p>
              )}
              {returnFlights.length > 0 && (
                <p className="text-[13px] truncate" style={{ color: "#2D1F0E" }}>
                  <span className="text-[11px] text-muted-foreground mr-1">Vuelta:</span>{retSummary}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {readOnly ? "No hay vuelos añadidos todavía" : "No has añadido tu vuelo todavía"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!readOnly && !hasAnyFlight && !editing && (
            <button
              type="button"
              onClick={handleOpenEdit}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] text-[12px] font-medium"
              style={{ background: "#C4793A", color: "#FAF2EB" }}
            >
              <Plus className="w-3.5 h-3.5" /> Añadir vuelo
            </button>
          )}
          {!readOnly && hasAnyFlight && !editing && (
            <button
              type="button"
              onClick={handleOpenEdit}
              className="text-[12px] font-medium px-2.5 py-1 rounded-full transition-colors"
              style={{ background: "#EAE6F5", color: "#3D2F6B" }}
            >
              Editar
            </button>
          )}
          {hasAnyFlight && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="p-1 hover:bg-muted/30 rounded transition-colors"
              aria-label={open ? "Colapsar" : "Expandir"}
            >
              {open
                ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-5 pt-4 pb-5 space-y-5">
          {editing ? (
            <>
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#C4793A" }}>Ida</div>
                <LegForm legs={outbound} outboundColor={true} onChange={setOutbound} />
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>Vuelta</div>
                <LegForm legs={ret} outboundColor={false} onChange={setRet} />
              </div>
              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] text-[12px] font-medium disabled:opacity-50"
                  style={{ background: "#C4793A", color: "#FAF2EB" }}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {saving ? "Guardando…" : "Guardar vuelos"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-8 px-3 rounded-[6px] text-[12px] text-muted-foreground border border-border hover:bg-muted/40"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : !hasAnyFlight && !readOnly ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <p className="text-[13px] text-muted-foreground">No has añadido tu vuelo todavía</p>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] text-[13px] font-medium"
                style={{ background: "#C4793A", color: "#FAF2EB" }}
              >
                <Plus className="w-4 h-4" /> Añadir vuelo
              </button>
            </div>
          ) : !hasAnyFlight && readOnly ? (
            <p className="text-[13px] text-muted-foreground text-center py-4">No hay vuelos añadidos todavía</p>
          ) : (
            <div className="space-y-4">
              {outboundFlights.length > 1 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#C4793A" }}>Ida — tramos adicionales</div>
                  {outboundFlights.slice(1).map((leg, i) => (
                    <p key={i} className="text-[13px]" style={{ color: "#2D1F0E" }}>{flightSummary([leg])}</p>
                  ))}
                </div>
              )}
              {returnFlights.length > 1 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>Vuelta — tramos adicionales</div>
                  {returnFlights.slice(1).map((leg, i) => (
                    <p key={i} className="text-[13px]" style={{ color: "#2D1F0E" }}>{flightSummary([leg])}</p>
                  ))}
                </div>
              )}
              {outboundFlights.length <= 1 && returnFlights.length <= 1 && (
                <p className="text-[12px] text-muted-foreground">No hay tramos adicionales.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
