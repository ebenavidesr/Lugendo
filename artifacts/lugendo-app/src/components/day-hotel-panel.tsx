import { useState, useMemo } from "react";
import { Hotel, Plus, X, Search, Loader2, Trash2, Check, Plane } from "lucide-react";
import {
  useListHotels,
  useCreateHotel,
  useAddItineraryDayHotel,
  useRemoveItineraryDayHotel,
  useAddTripDayHotel,
  useRemoveTripDayHotel,
  useUpdateItineraryDay,
  useUpdateTripDayAdmin,
  useUpdateTripDay,
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
  cityFromCountry?: string | null;
  cityToCountry?: string | null;
  isTransitNight?: boolean | null;
};

export function TransitNightBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${className}`}
      style={{ background: "#EAE6F5", color: "#3D2F6B" }}
    >
      <Plane className="w-3 h-3" />
      Noche en transporte
    </span>
  );
}

export function getNightLabel(dayIndex: number, allDays: GenericDay[]): string | null {
  const day = allDays[dayIndex];
  if (!day || day.isTransitNight) return null;
  const currentHotelId = day.hotels?.[0]?.hotelId;
  if (!currentHotelId) return null;

  let nights = 1;
  for (let i = dayIndex - 1; i >= 0; i--) {
    if (allDays[i]?.isTransitNight) continue;
    const prevHotelId = allDays[i]?.hotels?.[0]?.hotelId;
    if (prevHotelId === currentHotelId) {
      nights++;
    } else {
      break;
    }
  }
  if (nights === 1) return null;

  const ordinals = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª"];
  const label = ordinals[nights - 1] ?? `${nights}ª`;
  return `${label} noche`;
}

export function NightLabelBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: "#FAEEE4", color: "#C4793A" }}
    >
      {label}
    </span>
  );
}

export function DayHotelPanel({
  entityType,
  entityId,
  day,
  compact = false,
  allDays,
  invalidateKey,
  readOnly = false,
  transitReadOnly = false,
  travelerTrip = false,
}: {
  entityType: "itinerary" | "trip";
  entityId: number;
  day: GenericDay;
  compact?: boolean;
  allDays?: GenericDay[];
  invalidateKey?: string;
  readOnly?: boolean;
  /** Forces the "noche en transporte" toggle to read-only, independent of `readOnly` (which only gates hotel add/remove). Use for traveler-facing views where the viewer has no edit rights on the trip (agency trips, shared trips without full permission). */
  transitReadOnly?: boolean;
  /** Traveler context: day updates (e.g. the transit-night flag) go through PATCH /me/trips/:tripId/days/:dayId, which enforces traveler edit access and lazily migrates itinerary days. Back-office views leave this false to use the admin endpoint. */
  travelerTrip?: boolean;
}) {
  const { data: hotelCatalog } = useListHotels();
  const createHotel = useCreateHotel();
  const addItinHotel = useAddItineraryDayHotel();
  const removeItinHotel = useRemoveItineraryDayHotel();
  const addTripHotel = useAddTripDayHotel();
  const removeTripHotel = useRemoveTripDayHotel();
  const updateItinDay = useUpdateItineraryDay();
  const updateTripDayAdmin = useUpdateTripDayAdmin();
  const updateTripDayTraveler = useUpdateTripDay();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [togglingTransit, setTogglingTransit] = useState(false);

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
      const addData = { hotelId: hotel.id };
      if (entityType === "itinerary") {
        await addItinHotel.mutateAsync({ itineraryId: entityId, dayId: day.id, data: addData });
      } else {
        await addTripHotel.mutateAsync({ tripId: entityId, dayId: day.id, data: addData });
      }
      invalidate();
      toast({ title: `Hotel "${hotel.name}" creado y añadido.` });
      const candidates = getCandidates(hotel.id);
      if (candidates.length > 0) {
        setPendingHotelId(hotel.id);
        setPendingSegment("");
        setApplyMoreCandidates(candidates);
        setSelectedDayIds(new Set(candidates.map(d => d.id)));
        setMode("apply-more");
        setForm({ name: "", city: "", country: "", address: "", phone: "", website: "" });
        setSearchQ(""); setLookupResults([]); setLookupDone(false);
      } else {
        resetMode();
      }
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

  const filteredCatalog = useMemo(() => {
    if (!hotelCatalog || !searchQ.trim()) return [];
    const q = searchQ.toLowerCase();
    return hotelCatalog.filter(h =>
      h.name.toLowerCase().includes(q) ||
      (h.city && h.city.toLowerCase().includes(q))
    );
  }, [hotelCatalog, searchQ]);

  const quickAdd = (hotelId: number) => {
    const data = { hotelId };
    const callbacks = {
      onSuccess: () => {
        invalidate();
        toast({ title: "Hotel añadido" });
        const candidates = getCandidates(hotelId);
        if (candidates.length > 0) {
          setPendingHotelId(hotelId);
          setPendingSegment("");
          setApplyMoreCandidates(candidates);
          setSelectedDayIds(new Set(candidates.map(d => d.id)));
          setSearchQ("");
          setMode("apply-more");
        } else {
          resetMode();
        }
      },
      onError: () => toast({ variant: "destructive", title: "Error al añadir hotel" }),
    };
    if (entityType === "itinerary") {
      addItinHotel.mutate({ itineraryId: entityId, dayId: day.id, data }, callbacks);
    } else {
      addTripHotel.mutate({ tripId: entityId, dayId: day.id, data }, callbacks);
    }
  };

  const isPending = addItinHotel.isPending || removeItinHotel.isPending || addTripHotel.isPending || removeTripHotel.isPending;
  const currentHotels = day.hotels ?? [];
  const isTransitNight = !!day.isTransitNight;

  const setTransitNight = async (value: boolean) => {
    setTogglingTransit(true);
    try {
      if (value && currentHotels.length > 0) {
        const ok = confirm(
          `Este día tiene ${currentHotels.length} hotel${currentHotels.length > 1 ? "es" : ""} asignado${currentHotels.length > 1 ? "s" : ""}. ` +
          "Al marcarlo como noche en transporte se eliminarán. ¿Continuar?"
        );
        if (!ok) { setTogglingTransit(false); return; }
        for (const h of currentHotels) {
          await new Promise<void>((resolve, reject) => {
            const callbacks = { onSuccess: () => resolve(), onError: () => reject() };
            if (entityType === "itinerary") {
              removeItinHotel.mutate({ itineraryId: entityId, dayId: day.id, assignmentId: h.id }, callbacks);
            } else {
              removeTripHotel.mutate({ tripId: entityId, dayId: day.id, assignmentId: h.id }, callbacks);
            }
          });
        }
      }
      const data = { isTransitNight: value };
      await new Promise<void>((resolve, reject) => {
        const callbacks = { onSuccess: () => resolve(), onError: () => reject() };
        if (entityType === "itinerary") {
          updateItinDay.mutate({ itineraryId: entityId, dayId: day.id, data }, callbacks);
        } else if (travelerTrip) {
          updateTripDayTraveler.mutate({ tripId: entityId, dayId: day.id, data }, callbacks);
        } else {
          updateTripDayAdmin.mutate({ tripId: entityId, dayId: day.id, data }, callbacks);
        }
      });
      invalidate();
      resetMode();
      toast({ title: value ? "Marcado como noche en transporte" : "Noche en transporte desactivada" });
    } catch {
      invalidate();
      toast({
        variant: "destructive",
        title: "Error al actualizar el día",
        description: value ? "No se pudo desvincular algún hotel o guardar el cambio. Revisa el estado del día antes de reintentar." : undefined,
      });
    } finally {
      setTogglingTransit(false);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "mt-3 pt-3 border-t border-border/60"}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>
          Hoteles del día
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && !transitReadOnly && (
            <button
              onClick={() => setTransitNight(!isTransitNight)}
              disabled={togglingTransit}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium disabled:opacity-60 transition-colors"
              style={isTransitNight
                ? { background: "#3D2F6B", color: "#FAF2EB" }
                : { background: "#F0EEF7", color: "#3D2F6B" }}
              title="Marcar este día como noche en transporte">
              {togglingTransit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plane className="w-3 h-3" />}
              Noche en transporte
            </button>
          )}
          {mode === "idle" && !readOnly && !isTransitNight && (
            <button
              onClick={() => { setMode("add"); setSearchQ(""); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ background: "#FAEEE4", color: "#C4793A" }}>
              <Plus className="w-3 h-3" /> Añadir hotel
            </button>
          )}
        </div>
        {mode !== "idle" && mode !== "apply-more" && (
          <button onClick={resetMode} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" /> Cancelar
          </button>
        )}
      </div>

      {isTransitNight && (
        <div className="rounded-[8px] border border-border/60 px-3 py-2.5 flex items-center gap-2" style={{ background: "#F4F2FB" }}>
          <TransitNightBadge />
          <span className="text-[11px] text-muted-foreground">Sin hotel asignado para este día.</span>
        </div>
      )}

      {/* Existing hotel assignments */}
      {!isTransitNight && currentHotels.length === 0 && mode === "idle" && (
        <div className="text-[11px] text-muted-foreground italic py-1">
          Sin hoteles asignados.
        </div>
      )}
      {!isTransitNight && currentHotels.length > 0 && (
        <div className="space-y-1 mb-2">
          {currentHotels.map(h => {
            const seg = h.segment as SegmentValue | null;
            const segStyle = seg ? segmentColors[seg] : { bg: "#F0F0F0", color: "#666" };
            return (
              <div key={h.id} className="px-2.5 py-2 rounded-[8px] border border-border/60 bg-card">
                <div className="flex items-center gap-2">
                  <Hotel className="w-3.5 h-3.5 shrink-0" style={{ color: "#9C7A58" }} />
                  <span className="text-[12px] font-medium flex-1 truncate" style={{ color: "#2D1F0E" }}>
                    {h.hotelName}
                    {h.hotelCity && <span className="text-muted-foreground font-normal"> · {h.hotelCity}</span>}
                  </span>
                  {seg && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: segStyle.bg, color: segStyle.color }}>
                      {SEGMENTS.find(s => s.value === seg)?.label ?? seg}
                    </span>
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => handleRemove(h.id)}
                      disabled={isPending}
                      className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                      title="Quitar hotel">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {(h.hotelAddress || h.hotelPhone || h.hotelWebsite) && (
                  <div className="mt-1.5 ml-5 space-y-0.5">
                    {h.hotelAddress && (
                      <p className="text-[10px] text-muted-foreground truncate">{h.hotelAddress}</p>
                    )}
                    {(h.hotelPhone || h.hotelWebsite) && (
                      <div className="flex items-center gap-3 flex-wrap">
                        {h.hotelPhone && (
                          <a href={`tel:${h.hotelPhone}`} className="text-[10px] hover:underline" style={{ color: "#3D2F6B" }}>{h.hotelPhone}</a>
                        )}
                        {h.hotelWebsite && (
                          <a href={h.hotelWebsite} target="_blank" rel="noreferrer" className="text-[10px] hover:underline truncate max-w-[160px]" style={{ color: "#3D2F6B" }}>
                            {h.hotelWebsite.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add from catalog — search first */}
      {mode === "add" && (
        <div className="rounded-[8px] border border-border/60 p-3 space-y-2" style={{ background: "#FAF8F5" }}>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                placeholder="Buscar hotel por nombre o ciudad…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="w-full h-8 pl-7 pr-2.5 text-[12px] rounded-[6px] border border-border bg-white outline-none focus:ring-1 focus:ring-[#C4793A]/40"
              />
            </div>
          </div>
          {filteredCatalog.length > 0 && (
            <div className="rounded-[6px] border border-border bg-card overflow-hidden divide-y divide-border/50 max-h-48 overflow-y-auto">
              {filteredCatalog.map(hotel => (
                <button
                  key={hotel.id}
                  onClick={() => quickAdd(hotel.id)}
                  disabled={isPending}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors disabled:opacity-60">
                  <p className="text-[12px] font-medium truncate" style={{ color: "#2D1F0E" }}>{hotel.name}</p>
                  {hotel.city && (
                    <p className="text-[11px] text-muted-foreground">{hotel.city}{hotel.country ? ` · ${hotel.country}` : ""}</p>
                  )}
                </button>
              ))}
            </div>
          )}
          {searchQ.trim() && filteredCatalog.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Sin resultados en el catálogo.</p>
          )}
          {!searchQ.trim() && (
            <p className="text-[11px] text-muted-foreground">Escribe para buscar en el catálogo de hoteles.</p>
          )}
          <button
            onClick={() => { setMode("create"); setSearchQ(""); setForm(f => ({ ...f, city: day.cityTo ?? day.cityFrom ?? "", country: day.cityToCountry ?? day.cityFromCountry ?? "" })); }}
            className="text-[11px] font-medium hover:underline"
            style={{ color: "#C4793A" }}>
            + Crear hotel nuevo
          </button>
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
              {saving ? "Guardando…" : "Crear y añadir"}
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
