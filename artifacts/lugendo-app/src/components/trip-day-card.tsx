import { useState } from "react";
import { Camera, Hotel, ChevronRight, Star, X, Plus, Pencil, Trash2, Loader2, ChevronDown } from "lucide-react";
import type { TripDay, TripDayActivityItem, DayActivity } from "@workspace/api-client-react";
import { useRemoveTripDayActivity, COUNTRIES } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getTransportOption, TRANSPORT_OPTIONS } from "@/components/transport-select";
import { FreeActivitySheet } from "@/components/free-activity-sheet";
import { ActivityDetailSheet } from "@/components/activity-detail-sheet";
import { DayHotelPanel } from "@/components/day-hotel-panel";

const categoryEmoji: Record<string, string> = {
  cultural:    "🏛️",
  gastronomic: "🍽️",
  adventure:   "🧗",
  nature:      "🌿",
  beach:       "🏖️",
  city:        "🏙️",
  excursion:   "🚌",
  other:       "⭐",
};

function getCategoryEmoji(category: string | null | undefined): string {
  return categoryEmoji[category ?? ""] ?? "⭐";
}

function nightLabel(dayIndex: number, allDays: TripDay[]): string | null {
  const day = allDays[dayIndex];
  const currentHotelId = day?.hotels?.[0]?.hotelId;
  if (!currentHotelId) return null;

  let nights = 1;
  for (let i = dayIndex - 1; i >= 0; i--) {
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

function dayTitle(day: TripDay): string {
  if (day.cityFrom && day.cityTo) return `${day.cityFrom} → ${day.cityTo}`;
  return day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`;
}

function formatTimeRange(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime) return "";
  if (endTime) return `${startTime} – ${endTime}`;
  return startTime;
}

export interface DayEditData {
  cityFrom: string | null;
  cityTo: string | null;
  country: string | null;
  transport: string | null;
  description: string | null;
}

interface TripDayCardProps {
  day: TripDay;
  dayIndex: number;
  allDays: TripDay[];
  expanded: boolean;
  onToggle: () => void;
  tripId?: number;
  canEditDay?: boolean;
  canEditHotels?: boolean;
  onSaveDay?: (data: DayEditData) => Promise<void>;
  onDeleteDay?: () => void;
}

export function TripDayCard({ day, dayIndex, allDays, expanded, onToggle, tripId, canEditDay = false, canEditHotels = false, onSaveDay, onDeleteDay }: TripDayCardProps) {
  const hotel = day.hotels?.[0] ?? null;
  const activities: TripDayActivityItem[] = day.activities ?? [];
  const hotelNightLabel = nightLabel(dayIndex, allDays);
  const qc = useQueryClient();
  const { toast } = useToast();
  const removeActivity = useRemoveTripDayActivity();
  const [freeSheetOpen, setFreeSheetOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<TripDayActivityItem | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  const [dayEditOpen, setDayEditOpen] = useState(false);
  const [editCityFrom, setEditCityFrom] = useState(day.cityFrom ?? "");
  const [editCityTo, setEditCityTo] = useState(day.cityTo ?? "");
  const [editCountry, setEditCountry] = useState(day.country ?? "");
  const isValidTransport = (v: string | null | undefined) => TRANSPORT_OPTIONS.some(o => o.value === v);
  const [editTransport, setEditTransport] = useState(isValidTransport(day.transport) ? (day.transport ?? "") : "");
  const [editDescription, setEditDescription] = useState(day.description ?? "");
  const [savingDay, setSavingDay] = useState(false);

  const openDayEdit = () => {
    setEditCityFrom(day.cityFrom ?? "");
    setEditCityTo(day.cityTo ?? "");
    setEditCountry(day.country ?? "");
    setEditTransport(isValidTransport(day.transport) ? (day.transport ?? "") : "");
    setEditDescription(day.description ?? "");
    setDayEditOpen(true);
  };

  const handleSaveDay = async () => {
    if (!onSaveDay) return;
    setSavingDay(true);
    try {
      await onSaveDay({
        cityFrom: editCityFrom.trim() || null,
        cityTo: editCityTo.trim() || null,
        country: editCountry || null,
        transport: editTransport || null,
        description: editDescription.trim() || null,
      });
      setDayEditOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Error al guardar el día" });
    } finally {
      setSavingDay(false);
    }
  };

  const handleRemoveActivity = (linkId: number) => {
    if (!tripId) return;
    removeActivity.mutate(
      { tripId, dayId: day.id, linkId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}`] });
          toast({ title: "Actividad eliminada" });
        },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar actividad" }),
      }
    );
  };

  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 bg-card border border-border rounded-[14px] text-left hover:bg-muted/40 transition-colors"
        style={{ minHeight: 44 }}
      >
        <div
          className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 text-[11px] font-semibold"
          style={{ background: "var(--indigo)", color: "#FAF2EB" }}
        >
          {day.dayNumber}
        </div>

        <div className="flex-1 min-w-0 py-2.5">
          <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
            {dayTitle(day)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {activities.length > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-ter)" }}>
                {activities.length} {activities.length === 1 ? "actividad" : "actividades"}
              </span>
            )}
            {hotel && (
              <span
                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--arena)", color: "var(--text-sec)" }}
              >
                <Hotel className="w-3 h-3" />
                {hotel.hotelName}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-4 h-4 shrink-0 opacity-30" />
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-[18px] overflow-hidden">
      {/* Photo zone */}
      <div
        className="relative flex items-center justify-center cursor-pointer"
        style={{ height: 134, background: "var(--duna)" }}
        onClick={onToggle}
      >
        <Camera className="w-8 h-8 opacity-30" style={{ color: "var(--noche)" }} />

        <div
          className="absolute top-3 left-3 px-2.5 py-1 rounded-[8px] text-[12px] font-semibold shadow"
          style={{ background: "var(--indigo)", color: "#FAF2EB" }}
        >
          Día {day.dayNumber}
        </div>

        {canEditDay && (
          <button
            onClick={e => { e.stopPropagation(); openDayEdit(); }}
            className="absolute top-3 right-3 p-1.5 rounded-[8px] transition-colors"
            style={{ background: "rgba(255,255,255,0.2)", color: "#FAF2EB" }}
            title="Editar día"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Day title + destination */}
      <div className="px-4 pt-3 pb-0">
        <h3 className="text-[16px] font-medium" style={{ color: "var(--noche)" }}>
          {dayTitle(day)}
        </h3>
        {day.description && (
          <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-sec)" }}>
            {day.description}
          </p>
        )}
      </div>

      {/* Hotel row — read-only view */}
      {hotel && !canEditHotels && (
        <div
          className="mx-4 mt-3 flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-default"
          style={{ background: "var(--arena)" }}
        >
          <Hotel className="w-4 h-4 shrink-0" style={{ color: "var(--terra)" }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
                {hotel.hotelName}
              </p>
              {hotel.segment === "premium" && (
                <span className="inline-flex items-center gap-0.5 shrink-0">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-2.5 h-2.5 fill-current" style={{ color: "var(--terra)" }} />)}
                </span>
              )}
              {hotel.segment === "standard" && (
                <span className="inline-flex items-center gap-0.5 shrink-0">
                  {[1,2,3].map(i => <Star key={i} className="w-2.5 h-2.5 fill-current" style={{ color: "var(--terra)" }} />)}
                </span>
              )}
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-ter)" }}>
              {hotelNightLabel
                ? [hotelNightLabel, hotel.hotelCity].filter(Boolean).join(" · ")
                : ["Check-in", hotel.hotelCity].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-25" />
        </div>
      )}

      {/* Hotel management panel — edit mode */}
      {canEditHotels && tripId && (
        <div className="mx-4 mt-3">
          <DayHotelPanel
            entityType="trip"
            entityId={tripId}
            day={day}
            allDays={allDays}
            compact={true}
            invalidateKey={`/api/me/trips/${tripId}`}
          />
        </div>
      )}

      {/* Activities timeline */}
      {activities.length > 0 && (
        <div className="mt-3 px-4">
          <div
            className="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-50"
            style={{ color: "var(--noche)" }}
          >
            Actividades
          </div>
          <div className="relative">
            {/* Vertical connector line */}
            <div
              className="absolute left-[13px] top-4 bottom-4 w-[1.5px]"
              style={{ background: "var(--duna)" }}
            />

            <div className="space-y-0">
              {activities.map((activity, idx) => {
                const emoji = getCategoryEmoji(activity.activityCategory);
                const timeRange = formatTimeRange(activity.startTime, activity.endTime);
                const isAdHoc = activity.activityId == null;
                const isFree = !activity.included;
                const transportOpt = getTransportOption(activity.transportMode);
                const canDelete = activity.canEdit && tripId != null;
                const canEdit = activity.canEdit && tripId != null;

                return (
                  <div key={activity.id}>
                    {/* Transport separator before this activity (skip first) */}
                    {idx > 0 && transportOpt && (
                      <div className="flex items-center gap-2 py-1.5 ml-8">
                        <span className="text-[13px]">{transportOpt.icon}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-ter)" }}>
                          {transportOpt.label}
                        </span>
                      </div>
                    )}

                    {/* Activity row */}
                    <div className="flex items-start gap-3 py-2">
                      {/* Node dot with emoji */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative z-10 text-[13px]"
                        style={{ background: "var(--arena)", border: "1.5px solid var(--duna)" }}
                      >
                        {emoji}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-start gap-1.5 justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium leading-tight" style={{ color: "var(--noche)" }}>
                              {activity.activityName}
                            </p>
                            {timeRange ? (
                              <p className="text-[11px] mt-0.5 font-medium tabular-nums" style={{ color: "var(--terra)" }}>
                                {timeRange}
                              </p>
                            ) : (
                              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-ter)" }}>
                                Hora por confirmar
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isFree && (
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: "#F0F4F0", color: "#4A6A4A" }}
                              >
                                Por libre
                              </span>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => { setEditActivity(activity); setEditSheetOpen(true); }}
                                className="p-0.5 text-muted-foreground hover:text-[var(--indigo)] transition-colors"
                                title="Editar actividad"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleRemoveActivity(activity.id)}
                                className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors"
                                title="Eliminar actividad"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Extra details */}
                        {(activity.companyContact || (activity.addressOverride ?? activity.address) || activity.notes) && (
                          <div className="mt-1 space-y-0.5">
                            {activity.companyContact && (
                              <p className="text-[11px]" style={{ color: "var(--text-sec)" }}>
                                🏢 {activity.companyContact}
                              </p>
                            )}
                            {(activity.addressOverride ?? activity.address) && (
                              <p className="text-[11px]" style={{ color: "var(--text-sec)" }}>
                                📍 {activity.addressOverride ?? activity.address}
                              </p>
                            )}
                            {activity.notes && (
                              <p className="text-[11px] italic" style={{ color: "var(--text-ter)" }}>
                                {activity.notes}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add free activity button (traveler view) */}
      {tripId && (
        <div className="mx-4 mt-3 mb-1">
          <button
            onClick={() => setFreeSheetOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 h-8 rounded-[8px] text-[12px] font-medium border border-dashed border-border/80 hover:bg-muted/40 transition-colors"
            style={{ color: "var(--terra)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir actividad libre
          </button>
        </div>
      )}

      {/* Empty state for activities */}
      {activities.length === 0 && !hotel && !tripId && (
        <p className="px-4 pt-2 pb-0 text-[12px] italic" style={{ color: "var(--text-ter)" }}>
          Sin actividades ni alojamiento para este día.
        </p>
      )}

      {/* Inline day edit form */}
      {canEditDay && dayEditOpen && (
        <div className="mx-4 mt-3 border border-[var(--indigo)]/30 rounded-[12px] overflow-hidden">
          <button
            onClick={() => setDayEditOpen(false)}
            className="w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium border-b border-border/60"
            style={{ background: "#EAE6F5", color: "#3D2F6B" }}
          >
            <span>Editar información del día</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <div className="px-3 py-3 space-y-2.5 bg-white/60">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Ciudad origen</label>
                <input
                  className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[var(--indigo)]"
                  placeholder="Madrid"
                  value={editCityFrom}
                  onChange={e => setEditCityFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Ciudad destino</label>
                <input
                  className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[var(--indigo)]"
                  placeholder="Tokio"
                  value={editCityTo}
                  onChange={e => setEditCityTo(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">País</label>
                <select
                  className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[var(--indigo)] bg-white"
                  value={editCountry}
                  onChange={e => setEditCountry(e.target.value)}
                >
                  <option value="">— País —</option>
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Transporte</label>
                <select
                  className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[var(--indigo)] bg-white"
                  value={editTransport}
                  onChange={e => setEditTransport(e.target.value)}
                >
                  <option value="">— Transporte —</option>
                  {TRANSPORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Descripción</label>
              <textarea
                className="w-full px-2 py-1.5 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[var(--indigo)] resize-none"
                rows={2}
                placeholder="Notas sobre este día…"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSaveDay}
                disabled={savingDay}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium disabled:opacity-50"
                style={{ background: "#3D2F6B", color: "#FAF2EB" }}
              >
                {savingDay ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {savingDay ? "Guardando…" : "Guardar día"}
              </button>
              {onDeleteDay && (
                <button
                  onClick={onDeleteDay}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-red-200 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Eliminar día
                </button>
              )}
              <button
                onClick={() => setDayEditOpen(false)}
                className="h-7 px-3 rounded-[6px] text-[12px] text-muted-foreground hover:bg-muted/40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-4" />

      {/* Free activity sheet (create) */}
      {tripId && (
        <FreeActivitySheet
          tripId={tripId}
          dayId={day.id}
          open={freeSheetOpen}
          onOpenChange={setFreeSheetOpen}
        />
      )}

      {/* Edit sheet for canEdit activities */}
      {tripId && editActivity && (
        <ActivityDetailSheet
          tripId={tripId}
          dayId={day.id}
          activity={editActivity as unknown as DayActivity}
          open={editSheetOpen}
          onOpenChange={(open) => {
            setEditSheetOpen(open);
            if (!open) setEditActivity(null);
          }}
          queryKey={`/api/me/trips/${tripId}`}
        />
      )}
    </div>
  );
}
