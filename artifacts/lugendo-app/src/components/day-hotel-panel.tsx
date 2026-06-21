import { useState } from "react";
import { Hotel, Plus, X, Search, Loader2, Trash2, Check } from "lucide-react";
import {
  useListHotels,
  useCreateHotel,
  useAddItineraryDayHotel,
  useRemoveItineraryDayHotel,
  useAddTripDayHotel,
  useRemoveTripDayHotel,
} from "@workspace/api-client-react";
import type { DayHotel, SegmentValue } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountrySelectSmall } from "@/components/country-select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type HotelLookupResult = {
  name: string; city: string; country: string;
  address: string; phone: string; website: string;
};

const SEGMENTS: { value: NonNullable<SegmentValue>; label: string }[] = [
  { value: "basic",    label: "Básico" },
  { value: "standard", label: "Estándar" },
  { value: "premium",  label: "Premium" },
];

const segmentColors: Record<NonNullable<SegmentValue>, { bg: string; color: string }> = {
  basic:    { bg: "#ECD5B8", color: "#7A5C3A" },
  standard: { bg: "#FAEEE4", color: "#8B4420" },
  premium:  { bg: "#EAE6F5", color: "#3D2F6B" },
};

export type GenericDay = {
  id: number;
  dayNumber?: number | null;
  hotels?: DayHotel[] | null;
  cityFrom?: string | null;
  cityTo?: string | null;
  country?: string | null;
};

export function DayHotelPanel({
  entityType,
  entityId,
  day,
  compact = false,
  allDays,
  invalidateKey,
}: {
  entityType: "itinerary" | "trip";
  entityId: number;
  day: GenericDay;
  compact?: boolean;
  allDays?: GenericDay[];
  invalidateKey?: string;
}) {
  const { data: hotelCatalog } = useListHotels();
  const createHotel = useCreateHotel();
  const addItinHotel = useAddItineraryDayHotel();
  const removeItinHotel = useRemoveItineraryDayHotel();
  const addTripHotel = useAddTripDayHotel();
  const removeTripHotel = useRemoveTripDayHotel();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<"idle" | "add" | "create" | "apply-more">("idle");
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [selectedSegment, setSelectedSegment] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<HotelLookupResult[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", country: "", address: "", phone: "", website: "" });
  const [saving, setSaving] = useState(false);

  const [applyMoreCandidates, setApplyMoreCandidates] = useState<GenericDay[]>([]);
  const [selectedDayIds, setSelectedDayIds] = useState<Set<number>>(new Set());
  const [pendingHotelId, setPendingHotelId] = useState<number>(0);
  const [pendingSegment, setPendingSegment] = useState<string>("");
  const [applyingMore, setApplyingMore] = useState(false);

  const invalidate = () => {
    if (invalidateKey) {
      qc.invalidateQueries({ queryKey: [invalidateKey] });
    } else if (entityType === "itinerary") {
      qc.invalidateQueries({ queryKey: [`/api/itineraries/${entityId}/days`] });
    } else {
      qc.invalidateQueries({ queryKey: [`/api/trips/${entityId}`] });
    }
  };

  const addHotelToDay = (dayId: number, hotelId: number, segment: string) => {
    const data = {
      hotelId,
      ...(segment ? { segment: segment as SegmentValue } : {}),
    };
    return new Promise<void>((resolve) => {
      const callbacks = {
        onSuccess: () => resolve(),
        onError: () => resolve(),
      };
      if (entityType === "itinerary") {
        addItinHotel.mutate({ itineraryId: entityId, dayId, data }, callbacks);
      } else {
        addTripHotel.mutate({ tripId: entityId, dayId, data }, callbacks);
      }
    });
  };

  const getCandidates = (hotelId: number): GenericDay[] => {
    if (!allDays || !day.cityTo) return [];
    return allDays.filter(d =>
      d.id !== day.id &&
      d.cityTo &&
      d.cityTo.toLowerCase() === day.cityTo!.toLowerCase() &&
      !d.hotels?.some(h => h.hotelId === hotelId)
    );
  };

  const handleAdd = () => {
    if (!selectedHotelId) return;
    const hotelId = parseInt(selectedHotelId);
    const data = {
      hotelId,
      ...(selectedSegment ? { segment: selectedSegment as SegmentValue } : {}),
    };
    if (entityType === "itinerary") {
      addItinHotel.mutate({ itineraryId: entityId, dayId: day.id, data }, {
        onSuccess: () => {
          invalidate();
          toast({ title: "Hotel añadido" });
          const candidates = getCandidates(hotelId);
          if (candidates.length > 0) {
            setPendingHotelId(hotelId);
            setPendingSegment(selectedSegment);
            setApplyMoreCandidates(candidates);
            setSelectedDayIds(new Set(candidates.map(d => d.id)));
            setSelectedHotelId("");
            setSelectedSegment("");
            setMode("apply-more");
          } else {
            setMode("idle");
            setSelectedHotelId("");
            setSelectedSegment("");
          }
        },
        onError: () => toast({ variant: "destructive", title: "Error al añadir hotel" }),
      });
    } else {
      addTripHotel.mutate({ tripId: entityId, dayId: day.id, data }, {
        onSuccess: () => {
          invalidate();
          toast({ title: "Hotel añadido" });
          const candidates = getCandidates(hotelId);
          if (candidates.length > 0) {
            setPendingHotelId(hotelId);
            setPendingSegment(selectedSegment);
            setApplyMoreCandidates(candidates);
            setSelectedDayIds(new Set(candidates.map(d => d.id)));
            setSelectedHotelId("");
            setSelectedSegment("");
            setMode("apply-more");
          } else {
            setMode("idle");
            setSelectedHotelId("");
            setSelectedSegment("");
          }
        },
        onError: () => toast({ variant: "destructive", title: "Error al añadir hotel" }),
      });
    }
  };

  const handleApplyMore = async () => {
    if (selectedDayIds.size === 0) {
      setMode("idle");
      return;
    }
    setApplyingMore(true);
    const daysToApply = applyMoreCandidates.filter(d => selectedDayIds.has(d.id));
    await Promise.all(daysToApply.map(d => addHotelToDay(d.id, pendingHotelId, pendingSegment)));
    invalidate();
    toast({ title: `Hotel aplicado a ${daysToApply.length} día${daysToApply.length > 1 ? "s" : ""} más` });
    setApplyingMore(false);
    setMode("idle");
    setApplyMoreCandidates([]);
    setSelectedDayIds(new Set());
  };

  const handleRemove = (assignmentId: number) => {
    const callbacks = {
      onSuccess: () => {
        invalidate();
        toast({ title: "Hotel eliminado" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar hotel" }),
    };
    if (entityType === "itinerary") {
      removeItinHotel.mutate({ itineraryId: entityId, dayId: day.id, assignmentId }, callbacks);
    } else {
      removeTripHotel.mutate({ tripId: entityId, dayId: day.id, assignmentId }, callbacks);
    }
  };

  const handleLookup = async () => {
    if (!searchQ.trim()) return;
    setLookupLoading(true);
    setLookupDone(false);
    setLookupResults([]);
    try {
      const res = await fetch(`/api/hotels/lookup?q=${encodeURIComponent(searchQ)}`, { credentials: "include" });
      if (res.ok) setLookupResults(await res.json());
      else toast({ variant: "destructive", title: "Error al buscar hoteles" });
    } catch {
      toast({ variant: "destructive", title: "Error de conexión" });
    } finally {
      setLookupLoading(false);
      setLookupDone(true);
    }
  };

  const applyLookup = (r: HotelLookupResult) => {
    setForm({ name: r.name, city: r.city, country: r.country, address: r.address, phone: r.phone ?? "", website: r.website ?? "" });
    setLookupResults([]);
    setSearchQ("");
    setLookupDone(false);
  };

  const handleCreate = async () => {
    if (!form.name || !form.city || !form.country) return;
    setSaving(true);
    try {
      const hotel = await createHotel.mutateAsync({
        data: {
          name: form.name, city: form.city, country: form.country,
          ...(form.address ? { address: form.address } : {}),
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.website ? { website: form.website } : {}),
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/hotels"] });
      setSelectedHotelId(String(hotel.id));
      setForm({ name: "", city: "", country: "", address: "", phone: "", website: "" });
      setMode("add");
      toast({ title: `Hotel "${hotel.name}" creado. Ahora elige el segmento y confirma.` });
    } catch {
      toast({ variant: "destructive", title: "Error al crear el hotel" });
    } finally {
      setSaving(false);
    }
  };

  const resetMode = () => {
    setMode("idle");
    setSelectedHotelId("");
    setSelectedSegment("");
    setSearchQ(""); setLookupResults([]); setLookupDone(false);
    setForm({ name: "", city: "", country: "", address: "", phone: "", website: "" });
    setApplyMoreCandidates([]);
    setSelectedDayIds(new Set());
  };

  const toggleDaySelection = (dayId: number) => {
    setSelectedDayIds(prev => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  const isPending = addItinHotel.isPending || removeItinHotel.isPending || addTripHotel.isPending || removeTripHotel.isPending;
  const currentHotels = day.hotels ?? [];

  return (
    <div className={compact ? "space-y-2" : "mt-3 pt-3 border-t border-border/60"}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>
          Hoteles del día
        </div>
        {mode === "idle" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode("add")}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ background: "#EAE6F5", color: "#3D2F6B" }}>
              <Plus className="w-3 h-3" /> Añadir
            </button>
            <button
              onClick={() => { setMode("create"); setForm(f => ({ ...f, city: day.cityTo ?? day.cityFrom ?? "", country: day.country ?? "" })); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ background: "#FAEEE4", color: "#C4793A" }}>
              <Plus className="w-3 h-3" /> Nuevo hotel
            </button>
          </div>
        )}
        {mode !== "idle" && mode !== "apply-more" && (
          <button onClick={resetMode} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" /> Cancelar
          </button>
        )}
      </div>

      {/* Existing hotel assignments */}
      {currentHotels.length === 0 && mode === "idle" && (
        <div className="text-[11px] text-muted-foreground italic py-1">
          Sin hoteles asignados.
        </div>
      )}
      {currentHotels.length > 0 && (
        <div className="space-y-1 mb-2">
          {currentHotels.map(h => {
            const seg = h.segment as SegmentValue | null;
            const segStyle = seg ? segmentColors[seg] : { bg: "#F0F0F0", color: "#666" };
            return (
              <div key={h.id} className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] border border-border/60 bg-card">
                <Hotel className="w-3.5 h-3.5 shrink-0" style={{ color: "#9C7A58" }} />
                <span className="text-[12px] font-medium flex-1 truncate" style={{ color: "#2D1F0E" }}>
                  {h.hotelName}
                  {h.hotelCity && <span className="text-muted-foreground font-normal"> · {h.hotelCity ?? ""}</span>}
                </span>
                {seg && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ background: segStyle.bg, color: segStyle.color }}>
                    {SEGMENTS.find(s => s.value === seg)?.label ?? seg}
                  </span>
                )}
                <button
                  onClick={() => handleRemove(h.id)}
                  disabled={isPending}
                  className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                  title="Quitar hotel">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add from catalogue */}
      {mode === "add" && (
        <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#FAF8FF" }}>
          <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#3D2F6B" }}>Añadir hotel al día</p>
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Hotel del catálogo</label>
              <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue placeholder="Seleccionar hotel…" />
                </SelectTrigger>
                <SelectContent>
                  {hotelCatalog?.map(h => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      {h.name} — {h.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Segmento (opcional)</label>
              <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue placeholder="Sin segmento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin segmento</SelectItem>
                  {SEGMENTS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={handleAdd}
              disabled={!selectedHotelId || isPending}
              className="h-8 px-4 rounded-[6px] text-[12px] font-medium disabled:opacity-40 inline-flex items-center gap-1.5"
              style={{ background: "#3D2F6B", color: "white" }}>
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Create new hotel with web lookup */}
      {mode === "create" && (
        <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#FAF8F5" }}>
          <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#C4793A" }}>Buscar o crear hotel</p>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Buscar en la web</label>
            <div className="flex gap-1.5">
              <Input
                placeholder="Hotel Arts Barcelona…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLookup()}
                className="h-8 text-[12px] flex-1"
              />
              <button
                onClick={handleLookup}
                disabled={!searchQ.trim() || lookupLoading}
                className="h-8 px-3 rounded-[6px] text-[11px] font-medium disabled:opacity-40 inline-flex items-center gap-1"
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {lookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </button>
            </div>
            {lookupResults.length > 0 && (
              <div className="mt-1.5 rounded-[6px] border border-border bg-card overflow-hidden divide-y divide-border/60">
                {lookupResults.map((r, i) => (
                  <button key={i} onClick={() => applyLookup(r)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors">
                    <p className="text-[12px] font-medium truncate" style={{ color: "#2D1F0E" }}>{r.name}</p>
                    {(r.city || r.country) && (
                      <p className="text-[11px] text-muted-foreground truncate">{[r.city, r.country].filter(Boolean).join(", ")}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
            {lookupDone && lookupResults.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">Sin resultados. Rellena el nombre manualmente.</p>
            )}
          </div>

          <div className="space-y-2 pt-1 border-t border-border/60">
            <label className="text-[11px] text-muted-foreground block">Datos del hotel</label>
            <Input placeholder="Nombre *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-[12px]" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Ciudad *" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="h-8 text-[12px]" />
              <CountrySelectSmall value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} placeholder="País *" />
            </div>
            <Input placeholder="Dirección" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="h-8 text-[12px]" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-8 text-[12px]" />
              <Input placeholder="Web" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="h-8 text-[12px]" />
            </div>
            <button
              onClick={handleCreate}
              disabled={!form.name || !form.city || !form.country || saving}
              className="h-8 px-4 rounded-[6px] text-[12px] font-medium disabled:opacity-40"
              style={{ background: "#C4793A", color: "#FAF2EB" }}>
              {saving ? "Guardando…" : "Crear y continuar"}
            </button>
          </div>
        </div>
      )}

      {/* Apply to more days panel */}
      {mode === "apply-more" && (
        <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#F4F2FB" }}>
          <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#3D2F6B" }}>
            ¿Aplicar a más días en {day.cityTo}?
          </p>
          <div className="space-y-1.5">
            {applyMoreCandidates.map(candidate => {
              const checked = selectedDayIds.has(candidate.id);
              return (
                <button
                  key={candidate.id}
                  onClick={() => toggleDaySelection(candidate.id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] border transition-colors text-left"
                  style={{
                    borderColor: checked ? "#3D2F6B" : "var(--border)",
                    background: checked ? "#EAE6F5" : "white",
                  }}>
                  <div
                    className="w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors"
                    style={{
                      borderColor: checked ? "#3D2F6B" : "#C0B8D8",
                      background: checked ? "#3D2F6B" : "white",
                    }}>
                    {checked && <Check className="w-2.5 h-2.5" style={{ color: "white" }} />}
                  </div>
                  <span className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>
                    Día {candidate.dayNumber}
                  </span>
                  {candidate.cityTo && (
                    <span className="text-[11px] text-muted-foreground">· {candidate.cityTo}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleApplyMore}
              disabled={applyingMore || selectedDayIds.size === 0}
              className="h-8 px-4 rounded-[6px] text-[12px] font-medium disabled:opacity-40 inline-flex items-center gap-1.5"
              style={{ background: "#3D2F6B", color: "white" }}>
              {applyingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aplicar a seleccionados
            </button>
            <button
              onClick={() => setMode("idle")}
              disabled={applyingMore}
              className="h-8 px-3 rounded-[6px] text-[12px] text-muted-foreground hover:text-foreground border border-border disabled:opacity-40">
              Solo este día
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
