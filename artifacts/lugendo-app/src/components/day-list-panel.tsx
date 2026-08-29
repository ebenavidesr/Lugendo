import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Hotel, LayoutList, List, Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateItineraryDay,
  useUpdateItineraryDay,
  useDeleteItineraryDay,
  useCreateTripDayAdmin,
  useUpdateTripDayAdmin,
  useDeleteTripDayAdmin,
  useListDayActivities,
  useListTripDayActivities,
  COUNTRIES,
} from "@workspace/api-client-react";
import type { DayHotel, TransportMode } from "@workspace/api-client-react";
import { DayActivitiesPanel } from "@/components/day-activities-panel";
import { DayHotelPanel, TransitNightBadge, getNightLabel, NightLabelBadge } from "@/components/day-hotel-panel";
import { DayPhotoZone } from "@/components/day-photo-editor";
import { TransportLabel, TRANSPORT_OPTIONS } from "@/components/transport-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export type DayListMode = "trip" | "itinerary";

type DayEditData = {
  cityFrom: string | null;
  cityTo: string | null;
  cityFromCountry: string | null;
  cityToCountry: string | null;
  transport: TransportMode | null;
  description: string | null;
};

/** Fields common to ItineraryDay and TripDay — enough to render/edit a day regardless of which entity it belongs to. */
export type DayListItem = {
  id: number;
  dayNumber: number;
  cityFrom?: string | null;
  cityTo?: string | null;
  cityFromCountry?: string | null;
  cityToCountry?: string | null;
  transport?: TransportMode | null;
  description?: string | null;
  isTransitNight?: boolean;
  photoUrl?: string | null;
  hotels?: DayHotel[];
};

function dayTitle(day: DayListItem): string {
  if (day.cityFrom && day.cityTo) return `${day.cityFrom} → ${day.cityTo}`;
  return day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`;
}

function formatDayDate(startDate: string | null | undefined, dayNumber: number): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + dayNumber - 1);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

// ── Compact row (viewMode "summary") ────────────────────────────────────────
function CompactDayRow({ mode, entityId, day, startDate, onClick }: {
  mode: DayListMode;
  entityId: number;
  day: DayListItem;
  startDate?: string | null;
  onClick: () => void;
}) {
  const isItinerary = mode === "itinerary";
  const dateStr = formatDayDate(startDate, day.dayNumber);
  const itinActivities = useListDayActivities(isItinerary ? entityId : 0, day.id);
  const tripActivities = useListTripDayActivities(!isItinerary ? entityId : 0, day.id);
  const activityCount = (isItinerary ? itinActivities.data : tripActivities.data)?.length ?? 0;
  const hotelNames = (day.hotels ?? []).map(h => h.hotelName).join(", ");

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors text-left"
    >
      <div className="flex flex-col items-center justify-center min-w-[48px] h-10 rounded-lg bg-muted/40 border border-border/50">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase leading-none mb-0.5">Día</span>
        <span className="text-[16px] font-bold leading-none" style={{ color: "#3D2F6B" }}>{day.dayNumber}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-semibold text-foreground truncate">{dayTitle(day)}</span>
          {dateStr && <span className="text-[11px] text-muted-foreground">· {dateStr}</span>}
        </div>
        <div className="flex items-center gap-3">
          {day.isTransitNight ? (
            <TransitNightBadge />
          ) : hotelNames ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
              <Hotel className="w-3 h-3 shrink-0" />
              <span className="truncate">{hotelNames}</span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground/60 italic">Sin hotel</span>
          )}
          <span className="text-[11px] text-muted-foreground/60">·</span>
          <span className="text-[11px] text-muted-foreground">
            {activityCount} {activityCount === 1 ? "actividad" : "actividades"}
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </button>
  );
}

// ── Inline day edit form ─────────────────────────────────────────────────────
function DayEditForm({ mode, entityId, day, allDays, onSave, onSavePhoto, onDelete, onDone }: {
  mode: DayListMode;
  entityId: number;
  day: DayListItem;
  allDays?: DayListItem[];
  onSave: (data: DayEditData) => Promise<void>;
  onSavePhoto: (photoUrl: string | null) => Promise<void>;
  onDelete: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [cityFrom, setCityFrom] = useState(day.cityFrom ?? "");
  const [cityTo, setCityTo] = useState(day.cityTo ?? "");
  const [cityFromCountry, setCityFromCountry] = useState(day.cityFromCountry ?? "");
  const [cityToCountry, setCityToCountry] = useState(day.cityToCountry ?? "");
  const [transport, setTransport] = useState(day.transport ?? "");
  const [description, setDescription] = useState(day.description ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        cityFrom: cityFrom.trim() || null,
        cityTo: cityTo.trim() || null,
        cityFromCountry: cityFromCountry || null,
        cityToCountry: cityToCountry || null,
        transport: (transport || null) as TransportMode | null,
        description: description.trim() || null,
      });
      toast({ title: "Día actualizado" });
      onDone();
    } catch {
      toast({ variant: "destructive", title: "Error al actualizar el día" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!confirm("¿Eliminar este día?")) return;
    onDelete();
  };

  return (
    <div className="border-t border-border/60 px-3 py-3 space-y-2.5" style={{ background: "#FAF8FC" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Editar día</p>
      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">Foto de portada</label>
        <DayPhotoZone
          photoUrl={day.photoUrl}
          editable
          onSave={onSavePhoto}
          height={100}
          className="rounded-[8px]"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Ciudad origen</label>
          <input
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B]"
            placeholder="Madrid"
            value={cityFrom}
            onChange={e => setCityFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Ciudad destino</label>
          <input
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B]"
            placeholder="Tokio"
            value={cityTo}
            onChange={e => setCityTo(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">País origen</label>
          <select
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] bg-white"
            value={cityFromCountry}
            onChange={e => setCityFromCountry(e.target.value)}
          >
            <option value="">— País —</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">País destino</label>
          <select
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] bg-white"
            value={cityToCountry}
            onChange={e => setCityToCountry(e.target.value)}
          >
            <option value="">— País —</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">Transporte</label>
        <select
          className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] bg-white"
          value={transport}
          onChange={e => setTransport(e.target.value)}
        >
          <option value="">— Transporte —</option>
          {TRANSPORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">Descripción</label>
        <textarea
          className="w-full px-2 py-1.5 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] resize-none"
          rows={2}
          placeholder="Notas sobre este día…"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div className="rounded-[8px] border border-border/60 bg-card px-3 py-2.5">
        <DayHotelPanel entityType={mode} entityId={entityId} day={day} allDays={allDays} compact />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium disabled:opacity-50"
          style={{ background: "#3D2F6B", color: "#FAF2EB" }}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={handleDelete}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-red-200 text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-3 h-3" />
          Eliminar día
        </button>
        <button onClick={onDone} className="h-7 px-3 rounded-[6px] text-[12px] text-muted-foreground hover:bg-muted/40">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export interface DayListPanelProps {
  mode: DayListMode;
  entityId: number;
  days: DayListItem[] | undefined;
  isLoading?: boolean;
  /** Absolute trip dates ("Día N · 14 marzo"); omit for itinerary templates, which have no real dates. */
  startDate?: string | null;
  headerLabel: string;
  emptyMessage?: string;
  /** Page-specific controls rendered next to "Añadir día" (e.g. "Desde PDF" for itineraries, "Hoteles" bulk toggle for trips). */
  extraHeaderActions?: ReactNode;
  /** Page-specific panel rendered between the header bar and the day cards (e.g. the trip's bulk hotel manager). */
  belowHeaderContent?: ReactNode;
}

export function DayListPanel({ mode, entityId, days, isLoading, startDate, headerLabel, emptyMessage = "No hay días definidos todavía.", extraHeaderActions, belowHeaderContent }: DayListPanelProps) {
  const isItinerary = mode === "itinerary";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [editingDayId, setEditingDayId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"detail" | "summary">("detail");

  useEffect(() => {
    if (days && days.length > 0) {
      setExpandedDays(prev => (prev.size > 0 ? prev : new Set([days[0].id])));
    }
  }, [days?.[0]?.id]);

  const createItinDay = useCreateItineraryDay();
  const updateItinDay = useUpdateItineraryDay();
  const deleteItinDay = useDeleteItineraryDay();
  const createTripDay = useCreateTripDayAdmin();
  const updateTripDay = useUpdateTripDayAdmin();
  const deleteTripDay = useDeleteTripDayAdmin();

  const invalidate = () => {
    if (isItinerary) {
      qc.invalidateQueries({ queryKey: [`/api/itineraries/${entityId}/days`] });
      qc.invalidateQueries({ queryKey: [`/api/itineraries/${entityId}`] });
    } else {
      qc.invalidateQueries({ queryKey: [`/api/trips/${entityId}`] });
    }
  };

  const toggleDay = (dayId: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  const [addingDay, setAddingDay] = useState(false);
  const handleAddDay = async () => {
    const nextNum = days && days.length > 0 ? Math.max(...days.map(d => d.dayNumber)) + 1 : 1;
    setAddingDay(true);
    try {
      const created = isItinerary
        ? await createItinDay.mutateAsync({ itineraryId: entityId, data: { dayNumber: nextNum } })
        : await createTripDay.mutateAsync({ tripId: entityId, data: { dayNumber: nextNum, cityFrom: null, cityTo: null, cityFromCountry: null, cityToCountry: null, transport: null, description: null } });
      invalidate();
      toast({ title: `Día ${nextNum} añadido` });
      setExpandedDays(prev => new Set(prev).add(created.id));
      setEditingDayId(created.id);
    } catch {
      toast({ variant: "destructive", title: "Error al añadir el día" });
    } finally {
      setAddingDay(false);
    }
  };

  const handleSaveDay = async (dayId: number, data: DayEditData) => {
    if (isItinerary) {
      await updateItinDay.mutateAsync({ itineraryId: entityId, dayId, data });
    } else {
      await updateTripDay.mutateAsync({ tripId: entityId, dayId, data });
    }
    invalidate();
  };

  const handleDeleteDay = (dayId: number) => {
    const callbacks = {
      onSuccess: () => { invalidate(); toast({ title: "Día eliminado" }); setEditingDayId(null); },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar el día" }),
    };
    if (isItinerary) deleteItinDay.mutate({ itineraryId: entityId, dayId }, callbacks);
    else deleteTripDay.mutate({ tripId: entityId, dayId }, callbacks);
  };

  const handleSavePhoto = async (dayId: number, photoUrl: string | null) => {
    if (isItinerary) await updateItinDay.mutateAsync({ itineraryId: entityId, dayId, data: { photoUrl } });
    else await updateTripDay.mutateAsync({ tripId: entityId, dayId, data: { photoUrl } });
    invalidate();
  };

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-[14px] shadow-sm px-5 py-3.5 flex items-center justify-between flex-wrap gap-2">
        <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>{headerLabel}</span>
        <div className="flex items-center gap-3 flex-wrap">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as "detail" | "summary")}
            className="bg-muted/40 p-0.5 rounded-lg border border-border/50"
          >
            <ToggleGroupItem value="detail" className="h-7 px-2.5 text-[11px] font-medium data-[state=on]:bg-white data-[state=on]:shadow-sm rounded-md">
              <LayoutList className="w-3 h-3 mr-1.5" />
              Detalle
            </ToggleGroupItem>
            <ToggleGroupItem value="summary" className="h-7 px-2.5 text-[11px] font-medium data-[state=on]:bg-white data-[state=on]:shadow-sm rounded-md">
              <List className="w-3 h-3 mr-1.5" />
              Resumen
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="h-4 w-px bg-border/60 mx-1" />

          <button
            onClick={handleAddDay}
            disabled={addingDay}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
            style={{ background: "#EAE6F5", color: "#3D2F6B" }}
          >
            {addingDay ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Añadir día
          </button>
          {extraHeaderActions}
          {days && days.length > 0 && (
            <button
              onClick={() => {
                const allExpanded = days.every(d => expandedDays.has(d.id));
                if (allExpanded) setExpandedDays(new Set());
                else setExpandedDays(new Set(days.map(d => d.id)));
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              {days.every(d => expandedDays.has(d.id)) ? "Colapsar todos" : "Expandir todos"}
            </button>
          )}
        </div>
      </div>

      {belowHeaderContent}

      {isLoading ? (
        <div className="bg-card border border-border rounded-[14px] shadow-sm px-5 py-8 text-center text-sm text-muted-foreground">
          Cargando días…
        </div>
      ) : !days?.length ? (
        <div className="bg-card border border-border rounded-[14px] shadow-sm px-5 py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          {days.map(day => {
            const isExpanded = expandedDays.has(day.id);
            const isEditingThisDay = editingDayId === day.id;

            if (viewMode === "summary" && !isExpanded) {
              return (
                <div key={day.id} className="border border-border rounded-[14px] shadow-sm overflow-hidden animate-in fade-in duration-200" style={{ background: "white" }}>
                  <CompactDayRow mode={mode} entityId={entityId} day={day} startDate={startDate} onClick={() => toggleDay(day.id)} />
                </div>
              );
            }

            const dateStr = formatDayDate(startDate, day.dayNumber);

            return (
              <div key={day.id} className="border border-border rounded-[14px] shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200" style={{ background: "white" }}>
                <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 px-5 py-4">
                  <DayPhotoZone
                    photoUrl={day.photoUrl}
                    editable={false}
                    onSave={async () => {}}
                    square={140}
                    className="rounded-[12px]"
                  />
                  <div className="flex items-start gap-4 flex-1 min-w-0 w-full">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-medium uppercase tracking-[0.5px]" style={{ color: "var(--terra)" }}>
                          Día {day.dayNumber}
                        </span>
                        <span className="text-[12px]" style={{ color: "var(--ocre)" }}>
                          {dateStr && `· ${dateStr} `}
                          {(day.cityTo ?? day.cityFrom) && `· ${day.cityTo ?? day.cityFrom}`}
                        </span>
                      </div>
                      <p className="text-[14px] font-medium mt-1" style={{ color: "#2D1F0E" }}>{dayTitle(day)}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {day.transport && (
                          <span className="text-[12px] text-muted-foreground">
                            <TransportLabel value={day.transport} />
                          </span>
                        )}
                        {day.isTransitNight ? (
                          <TransitNightBadge />
                        ) : day.hotels && day.hotels.length > 0 && (
                          <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                            🏨 {day.hotels.map(h => h.hotelName).join(", ")}
                            {(() => {
                              const label = getNightLabel(days.findIndex(d => d.id === day.id), days);
                              return label ? <NightLabelBadge label={label} /> : null;
                            })()}
                          </span>
                        )}
                      </div>
                      {day.description && !isExpanded && (
                        <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{day.description}</p>
                      )}

                      {isExpanded && !isEditingThisDay && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-3 space-y-4">
                          {day.description && (
                            <p className="text-[13px] text-muted-foreground leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/40">
                              {day.description}
                            </p>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <DayHotelPanel entityType={mode} entityId={entityId} day={day} allDays={days} />
                            <DayActivitiesPanel entityType={mode} entityId={entityId} dayId={day.id} day={day} days={days} />
                          </div>
                        </div>
                      )}
                      {isEditingThisDay && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-3">
                          <DayEditForm
                            mode={mode}
                            entityId={entityId}
                            day={day}
                            allDays={days}
                            onSave={data => handleSaveDay(day.id, data)}
                            onSavePhoto={photoUrl => handleSavePhoto(day.id, photoUrl)}
                            onDelete={() => handleDeleteDay(day.id)}
                            onDone={() => setEditingDayId(null)}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => {
                          setEditingDayId(isEditingThisDay ? null : day.id);
                          if (!isExpanded) toggleDay(day.id);
                        }}
                        className="p-1.5 rounded-[6px] text-muted-foreground hover:text-[#3D2F6B] hover:bg-[#EAE6F5] transition-colors"
                        title="Editar día"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleDay(day.id)}
                        className="p-1.5 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={isExpanded ? "Colapsar" : "Ver detalle"}
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

