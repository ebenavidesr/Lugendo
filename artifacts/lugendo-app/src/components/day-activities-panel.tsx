import { useState } from "react";
import { Plus, X, Search, Loader2, Pencil, ChevronDown } from "lucide-react";
import {
  useListDayActivities,
  useAddDayActivity,
  useRemoveDayActivity,
  useListTripDayActivities,
  useAddTripDayActivity,
  useRemoveTripDayActivity,
  useListActivities,
  useCreateActivity,
} from "@workspace/api-client-react";
import type { Activity, DayActivity, TransportMode } from "@workspace/api-client-react";
import { ActivityDetailSheet } from "@/components/activity-detail-sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CountrySelectSmall } from "@/components/country-select";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getTransportOption, TransportSelect } from "@/components/transport-select";

import { categoryMeta } from "@/components/activity-meta";
export { categoryMeta } from "@/components/activity-meta";

type LookupResult = { name: string; city: string; country: string; address: string; description: string };

type DayContext = {
  cityFromCountry?: string | null;
  cityToCountry?: string | null;
  cityFrom?: string | null;
  cityTo?: string | null;
};

function formatTimeRange(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime) return "";
  if (endTime) return `${startTime} – ${endTime}`;
  return startTime;
}

export function DayActivitiesPanel({
  entityType,
  entityId,
  dayId,
  compact = false,
  day,
  days,
}: {
  entityType: "itinerary" | "trip";
  entityId: number;
  dayId: number;
  compact?: boolean;
  day?: DayContext;
  days?: { id: number; dayNumber: number }[];
}) {
  const isItinerary = entityType === "itinerary";

  const itinActivities = useListDayActivities(isItinerary ? entityId : 0, dayId);
  const tripActivities = useListTripDayActivities(!isItinerary ? entityId : 0, dayId);
  const { data: dayActivities, isLoading } = isItinerary ? itinActivities : tripActivities;

  const { data: allActivities } = useListActivities();
  const addItin = useAddDayActivity();
  const addTrip = useAddTripDayActivity();
  const removeItin = useRemoveDayActivity();
  const removeTrip = useRemoveTripDayActivity();
  const createActivity = useCreateActivity();
  const qc = useQueryClient();
  const { toast } = useToast();

  const queryKey = isItinerary
    ? `/api/itineraries/${entityId}/days/${dayId}/activities`
    : `/api/trips/${entityId}/days/${dayId}/activities`;

  const [mode, setMode] = useState<"idle" | "link" | "create">("idle");
  const [editActivity, setEditActivity] = useState<DayActivity | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [openActivityIds, setOpenActivityIds] = useState<Set<number>>(new Set());
  const toggleActivity = (id: number) => {
    setOpenActivityIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // link mode
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");

  // create mode
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newCompanyContact, setNewCompanyContact] = useState("");
  const [newAddressOverride, setNewAddressOverride] = useState("");
  const [newTransportMode, setNewTransportMode] = useState("");
  const [newIncluded, setNewIncluded] = useState(true);
  const [newCostAmount, setNewCostAmount] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // lookup
  const [lookupQ, setLookupQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [lookupDone, setLookupDone] = useState(false);

  const linkedIds = new Set((dayActivities ?? []).map(a => a.activityId).filter((id): id is number => id != null));
  const availableActivities = (allActivities ?? []).filter(a => !linkedIds.has(a.id));

  const openCreate = () => {
    setNewCity(day?.cityTo ?? day?.cityFrom ?? "");
    setNewCountry(day?.cityToCountry ?? day?.cityFromCountry ?? "");
    setMode("create");
  };

  const resetForm = () => {
    setMode("idle");
    setSelectedActivityId(""); setStartTime(""); setNotes("");
    setNewName(""); setNewCategory(""); setNewCity(""); setNewCountry("");
    setNewStartTime(""); setNewEndTime(""); setNewCompanyContact(""); setNewAddressOverride("");
    setNewTransportMode(""); setNewIncluded(true); setNewCostAmount(""); setNewNotes("");
    setLookupQ(""); setLookupResults([]); setLookupDone(false);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const doAdd = (activityId: number, st?: string, n?: string, cb?: () => void) => {
    const data = {
      activityId,
      ...(st ? { startTime: st } : {}),
      ...(n ? { notes: n } : {}),
    };
    const callbacks = {
      onSuccess: () => { invalidate(); cb?.(); },
      onError: () => toast({ variant: "destructive", title: "Error al añadir actividad" }),
    };
    if (isItinerary) {
      addItin.mutate({ itineraryId: entityId, dayId, data }, callbacks);
    } else {
      addTrip.mutate({ tripId: entityId, dayId, data }, callbacks);
    }
  };

  const doRemove = (linkId: number) => {
    const callbacks = {
      onSuccess: invalidate,
      onError: () => toast({ variant: "destructive", title: "Error al eliminar actividad" }),
    };
    if (isItinerary) {
      removeItin.mutate({ itineraryId: entityId, dayId, linkId }, callbacks);
    } else {
      removeTrip.mutate({ tripId: entityId, dayId, linkId }, callbacks);
    }
  };

  const handleLink = () => {
    if (!selectedActivityId || selectedActivityId === "none") return;
    doAdd(parseInt(selectedActivityId), startTime || undefined, notes || undefined, () => {
      toast({ title: "Actividad añadida" });
      resetForm();
    });
  };

  const handleLookup = async () => {
    if (!lookupQ.trim()) return;
    setLookupLoading(true);
    setLookupDone(false);
    setLookupResults([]);
    try {
      const res = await fetch(`/api/activities/lookup?q=${encodeURIComponent(lookupQ)}`, { credentials: "include" });
      if (res.ok) setLookupResults(await res.json());
      else toast({ variant: "destructive", title: "Error al buscar actividades" });
    } catch {
      toast({ variant: "destructive", title: "Error de conexión" });
    } finally {
      setLookupLoading(false);
      setLookupDone(true);
    }
  };

  const applyLookupResult = (r: LookupResult) => {
    setNewName(r.name);
    setNewCity(r.city);
    setNewCountry(r.country);
    setLookupResults([]);
    setLookupQ("");
    setLookupDone(false);
  };

  const handleCreateAndLink = async () => {
    if (!newName.trim()) return;
    // Capture form state before any async operation to avoid stale closure issues
    const capturedStartTime = newStartTime;
    const capturedNotes = newNotes;
    const capturedEndTime = newEndTime;
    const capturedCompanyContact = newCompanyContact;
    const capturedAddressOverride = newAddressOverride;
    const capturedTransportMode = newTransportMode;
    const capturedIncluded = newIncluded;
    const capturedCostAmount = newCostAmount;
    try {
      const created = await createActivity.mutateAsync({
        data: {
          name: newName.trim(),
          ...(newCategory ? { category: newCategory as "cultural" | "gastronomic" | "adventure" | "nature" | "beach" | "city" | "excursion" | "other" } : {}),
          ...(newCity ? { city: newCity } : {}),
          ...(newCountry ? { country: newCountry } : {}),
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/activities"] });
      const addData = {
        activityId: created.id,
        ...(capturedStartTime ? { startTime: capturedStartTime } : {}),
        ...(capturedNotes ? { notes: capturedNotes } : {}),
        ...(!isItinerary ? { included: capturedIncluded } : {}),
        ...(!isItinerary && capturedEndTime ? { endTime: capturedEndTime } : {}),
        ...(!isItinerary && capturedCompanyContact ? { companyContact: capturedCompanyContact } : {}),
        ...(!isItinerary && capturedAddressOverride ? { addressOverride: capturedAddressOverride } : {}),
        ...(!isItinerary && capturedTransportMode ? { transportMode: capturedTransportMode as TransportMode } : {}),
        ...(!isItinerary && !capturedIncluded && capturedCostAmount ? { costAmount: parseFloat(capturedCostAmount) } : {}),
      };
      if (isItinerary) {
        await addItin.mutateAsync({ itineraryId: entityId, dayId, data: addData });
      } else {
        await addTrip.mutateAsync({ tripId: entityId, dayId, data: addData });
      }
      invalidate();
      toast({ title: "Actividad creada y añadida" });
      resetForm();
    } catch {
      toast({ variant: "destructive", title: "Error al crear la actividad" });
    }
  };

  const isPending = addItin.isPending || addTrip.isPending || createActivity.isPending;

  return (
    <div className={compact ? "space-y-2" : "mt-3 pt-3 border-t border-border/60"}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>
          Actividades del día
        </div>
        {mode === "idle" && (
          <div className="flex items-center gap-1">
            {availableActivities.length > 0 && (
              <button
                onClick={() => setMode("link")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
                style={{ background: "#EAE6F5", color: "#3D2F6B" }}>
                <Plus className="w-3 h-3" /> Vincular
              </button>
            )}
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ background: "#FAEEE4", color: "#C4793A" }}>
              <Plus className="w-3 h-3" /> Nueva
            </button>
          </div>
        )}
        {mode !== "idle" && (
          <button onClick={resetForm} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" /> Cancelar
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-[11px] text-muted-foreground">Cargando…</div>
      ) : (
        <>
          {dayActivities && dayActivities.length > 0 && (
            <div className="mb-3">
              <ul className="list-none m-0 p-0">
                {dayActivities.map((a, idx) => {
                  const timeRange = formatTimeRange(a.startTime, a.endTime ?? undefined);
                  const isFree = !a.included;
                  const canEdit = a.canEdit !== false;

                  // ── Row shared by itinerary and trip (#159/#171): collapsed to one line, expands individually on click ──
                  const transportOpt = getTransportOption(a.transportMode ?? undefined);
                  const isOpen = openActivityIds.has(a.id);
                  const address = a.addressOverride ?? a.address;
                  const hasDetail = !!(a.description || a.companyContact || address || a.notes || (isFree && a.costAmount != null));

                  return (
                    <li key={a.id} className={idx > 0 ? "border-t" : ""} style={{ borderColor: "var(--arena)" }}>
                      {/* Transport separator before activity (skip first) */}
                      {idx > 0 && transportOpt && (
                        <div className="flex items-center gap-2 py-1">
                          <span className="text-[12px]">{transportOpt.icon}</span>
                          <span className="text-[10px]" style={{ color: "var(--text-ter, #9C7A58)" }}>
                            {transportOpt.label}
                          </span>
                        </div>
                      )}

                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => hasDetail && toggleActivity(a.id)}
                        onKeyDown={e => { if (hasDetail && (e.key === "Enter" || e.key === " ")) toggleActivity(a.id); }}
                        className="flex items-center gap-2.5 py-2"
                        style={{ cursor: hasDetail ? "pointer" : "default" }}
                      >
                        {a.included ? (
                          <span
                            className="shrink-0 text-[10px] font-medium uppercase tracking-[0.4px] px-[7px] py-[3px] rounded-[5px]"
                            style={{ background: "var(--indigo)", color: "var(--arena)" }}
                          >
                            Incluída
                          </span>
                        ) : (
                          <span
                            className="shrink-0 text-[10px] font-medium uppercase tracking-[0.4px] px-[7px] py-[3px] rounded-[5px]"
                            style={{ background: "var(--arena)", color: "var(--ocre)", border: "1px solid var(--duna)" }}
                          >
                            {a.createdByName ? `Por libre · ${a.createdByName}` : "Por libre"}
                          </span>
                        )}
                        <span className="shrink-0 whitespace-nowrap text-[12.5px] tabular-nums" style={{ color: "var(--ocre)" }}>
                          {timeRange || "—"}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[12.5px]" style={{ color: "#2D1F0E" }}>
                          {a.activityName}
                        </span>
                        {canEdit && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditActivity(a as unknown as DayActivity); setEditSheetOpen(true); }}
                            className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                            style={{ color: "var(--ocre)" }}
                            title="Editar actividad">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!canEdit && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditActivity(a as unknown as DayActivity); setEditSheetOpen(true); }}
                            className="shrink-0 p-0.5 opacity-30"
                            style={{ color: "var(--ocre)" }}
                            title="Ver actividad">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={e => { e.stopPropagation(); doRemove(a.id); }}
                            className="shrink-0 p-0.5 opacity-60 hover:opacity-100 hover:text-red-500 transition-colors"
                            style={{ color: "var(--ocre)" }}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {hasDetail && (
                          <ChevronDown
                            className="shrink-0 w-3.5 h-3.5 transition-transform"
                            style={{ color: "var(--ocre)", transform: isOpen ? "rotate(180deg)" : undefined }}
                          />
                        )}
                      </div>

                      {isOpen && hasDetail && (
                        <div className="pb-3 pl-0 sm:pl-12 animate-in fade-in duration-150">
                          {a.description && (
                            <p className="text-[12.5px] leading-relaxed mb-2.5" style={{ color: "#2D1F0E" }}>{a.description}</p>
                          )}
                          <div className="flex flex-col gap-1.5">
                            {address && (
                              <div className="flex gap-2 text-[12px]">
                                <span className="shrink-0" style={{ color: "var(--ocre)", minWidth: 68 }}>Dirección</span>
                                <span style={{ color: "#2D1F0E" }}>{address}</span>
                              </div>
                            )}
                            {isFree && a.costAmount != null && (
                              <div className="flex gap-2 text-[12px]">
                                <span className="shrink-0" style={{ color: "var(--ocre)", minWidth: 68 }}>Coste</span>
                                <span style={{ color: "#2D1F0E" }}>{a.costAmount.toFixed(2)} {a.costCurrency ?? "EUR"} por persona</span>
                              </div>
                            )}
                            {a.companyContact && (
                              <div className="flex gap-2 text-[12px]">
                                <span className="shrink-0" style={{ color: "var(--ocre)", minWidth: 68 }}>Contacto</span>
                                <span style={{ color: "#2D1F0E" }}>{a.companyContact}</span>
                              </div>
                            )}
                          </div>
                          {a.notes && (
                            <div className="mt-2 px-2.5 py-2 rounded-[7px] text-[11.5px] leading-relaxed" style={{ background: "var(--arena)", color: "var(--ocre)" }}>
                              {a.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── Activity detail sheet ── */}
          <ActivityDetailSheet
            entityType={isItinerary ? "itinerary" : "trip"}
            entityId={entityId}
            dayId={dayId}
            days={days}
            activity={editActivity}
            open={editSheetOpen}
            onOpenChange={(open) => {
              setEditSheetOpen(open);
              if (!open) setEditActivity(null);
            }}
            queryKey={queryKey}
          />

          {/* ── Link existing ── */}
          {mode === "link" && (
            <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#FAF8FF" }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#3D2F6B" }}>Vincular actividad del catálogo</p>
              <Select value={selectedActivityId} onValueChange={setSelectedActivityId}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue placeholder="Seleccionar actividad…" />
                </SelectTrigger>
                <SelectContent>
                  {availableActivities.map((a: Activity) => {
                    const meta = categoryMeta[a.category ?? ""] ?? categoryMeta.other;
                    return (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {meta.emoji} {a.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Hora de inicio</label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-8 text-[12px] w-36" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Notas del día</label>
                <Textarea placeholder="Punto de encuentro, indicaciones especiales…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-[12px] resize-none" />
              </div>
              <button onClick={handleLink} disabled={!selectedActivityId || selectedActivityId === "none" || isPending}
                className="h-8 px-4 rounded-[6px] text-[12px] font-medium disabled:opacity-40"
                style={{ background: "#3D2F6B", color: "#FAF2EB" }}>
                {isPending ? "Añadiendo…" : "Añadir al día"}
              </button>
            </div>
          )}

          {/* ── Create new ── */}
          {mode === "create" && (
            <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#FAEEE4" }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#C4793A" }}>Nueva actividad</p>

              {/* Lookup */}
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Buscar en la web</label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Plaza Mayor Madrid, Parque Güell…"
                    value={lookupQ}
                    onChange={e => setLookupQ(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLookup()}
                    className="h-8 text-[12px] flex-1"
                  />
                  <button
                    onClick={handleLookup}
                    disabled={!lookupQ.trim() || lookupLoading}
                    className="h-8 px-3 rounded-[6px] text-[11px] font-medium disabled:opacity-40 inline-flex items-center gap-1"
                    style={{ background: "#C4793A", color: "#FAF2EB" }}>
                    {lookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {lookupResults.length > 0 && (
                  <div className="mt-1.5 rounded-[6px] border border-border bg-card overflow-hidden divide-y divide-border/60">
                    {lookupResults.map((r, i) => (
                      <button key={i} onClick={() => applyLookupResult(r)}
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

              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Nombre *</label>
                <Input placeholder="Visita guiada a la Medina…" value={newName} onChange={e => setNewName(e.target.value)} className="h-8 text-[12px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Ciudad</label>
                  <Input placeholder="Barcelona" value={newCity} onChange={e => setNewCity(e.target.value)} className="h-8 text-[12px]" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">País</label>
                  <CountrySelectSmall value={newCountry} onChange={setNewCountry} placeholder="País" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Categoría</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryMeta).map(([key, { emoji, label }]) => (
                      <SelectItem key={key} value={key}>{emoji} {label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={isItinerary ? "" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Hora de inicio (para este día)</label>
                  <Input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} className="h-8 text-[12px]" />
                </div>
                {!isItinerary && (
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Hora de fin</label>
                    <Input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} className="h-8 text-[12px]" />
                  </div>
                )}
              </div>

              {!isItinerary && (
                <>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Empresa / Contacto</label>
                    <Input placeholder="Nombre del tour, empresa, teléfono…" value={newCompanyContact} onChange={e => setNewCompanyContact(e.target.value)} className="h-8 text-[12px]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Dirección (para este día)</label>
                    <Input placeholder="Sobreescribe la dirección del catálogo…" value={newAddressOverride} onChange={e => setNewAddressOverride(e.target.value)} className="h-8 text-[12px]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Transporte para llegar</label>
                    <TransportSelect value={newTransportMode} onChange={setNewTransportMode} placeholder="Sin transporte definido" className="h-8 text-[12px]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Tipo de actividad</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNewIncluded(true)}
                        className="flex-1 h-8 rounded-[6px] text-[11px] font-medium border transition-colors"
                        style={{
                          background: newIncluded ? "var(--indigo)" : "transparent",
                          color: newIncluded ? "#FAF2EB" : "var(--noche)",
                          borderColor: newIncluded ? "var(--indigo)" : "var(--border)",
                        }}
                      >
                        Incluida
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewIncluded(false)}
                        className="flex-1 h-8 rounded-[6px] text-[11px] font-medium border transition-colors"
                        style={{
                          background: !newIncluded ? "#4A6A4A" : "transparent",
                          color: !newIncluded ? "#fff" : "var(--noche)",
                          borderColor: !newIncluded ? "#4A6A4A" : "var(--border)",
                        }}
                      >
                        Por libre
                      </button>
                    </div>
                  </div>
                  {!newIncluded && (
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">Coste por persona (€)</label>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" value={newCostAmount} onChange={e => setNewCostAmount(e.target.value)} className="h-8 text-[12px] w-32" />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Notas del día</label>
                <Textarea placeholder="Punto de encuentro, indicaciones especiales…" value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2} className="text-[12px] resize-none" />
              </div>
              <button onClick={handleCreateAndLink} disabled={!newName.trim() || isPending}
                className="h-8 px-4 rounded-[6px] text-[12px] font-medium disabled:opacity-40"
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {isPending ? "Creando…" : "Crear y añadir al día"}
              </button>
            </div>
          )}

          {mode === "idle" && !dayActivities?.length && (
            <div className="text-[11px] text-muted-foreground italic py-1">
              Sin actividades. Usa los botones para vincular o crear una.
            </div>
          )}
        </>
      )}
    </div>
  );
}
