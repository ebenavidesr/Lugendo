import { useState } from "react";
import { Hotel, ChevronRight, X, Plus, Pencil, Trash2, Loader2, ChevronDown } from "lucide-react";
import type { TripDay, TripDayActivityItem, DayActivity } from "@workspace/api-client-react";
import { useRemoveTripDayActivity, COUNTRIES } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getTransportOption, TRANSPORT_OPTIONS } from "@/components/transport-select";
import { FreeActivitySheet } from "@/components/free-activity-sheet";
import { ActivityDetailSheet } from "@/components/activity-detail-sheet";
import { DayHotelPanel, TransitNightBadge, getNightLabel, NightLabelBadge } from "@/components/day-hotel-panel";
import { DayPhotoZone } from "@/components/day-photo-editor";

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

function dayTitle(day: TripDay): string {
  if (day.cityFrom && day.cityTo) return `${day.cityFrom} → ${day.cityTo}`;
  return day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`;
}

function formatTimeRange(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime) return "";
  if (endTime) return `${startTime} – ${endTime}`;
  return startTime;
}

function formatDayDate(startDate: string | null | undefined, dayNumber: number): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + dayNumber - 1);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

export interface DayEditData {
  cityFrom: string | null;
  cityTo: string | null;
  cityFromCountry: string | null;
  cityToCountry: string | null;
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
  startDate?: string | null;
  onSaveDay?: (data: DayEditData) => Promise<void>;
  onDeleteDay?: () => void;
  onSavePhoto?: (photoUrl: string | null) => Promise<void>;
}

export function TripDayCard({ day, dayIndex, allDays, expanded, onToggle, tripId, canEditDay = false, canEditHotels = false, startDate, onSaveDay, onDeleteDay, onSavePhoto }: TripDayCardProps) {
  const hotel = day.hotels?.[0] ?? null;
  const activities: TripDayActivityItem[] = day.activities ?? [];
  const hotelNightLabel = getNightLabel(dayIndex, allDays);
  const dayDateStr = formatDayDate(startDate, day.dayNumber);
  const qc = useQueryClient();
  const { toast } = useToast();
  const removeActivity = useRemoveTripDayActivity();
  const [freeSheetOpen, setFreeSheetOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<TripDayActivityItem | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  const [dayEditOpen, setDayEditOpen] = useState(false);
  const [editCityFrom, setEditCityFrom] = useState(day.cityFrom ?? "");
  const [editCityTo, setEditCityTo] = useState(day.cityTo ?? "");
  const [editCityFromCountry, setEditCityFromCountry] = useState(day.cityFromCountry ?? "");
  const [editCityToCountry, setEditCityToCountry] = useState(day.cityToCountry ?? "");
  const isValidTransport = (v: string | null | undefined) => TRANSPORT_OPTIONS.some(o => o.value === v);
  const [editTransport, setEditTransport] = useState(isValidTransport(day.transport) ? (day.transport ?? "") : "");
  const [editDescription, setEditDescription] = useState(day.description ?? "");
  const [savingDay, setSavingDay] = useState(false);

  const openDayEdit = () => {
    setEditCityFrom(day.cityFrom ?? "");
    setEditCityTo(day.cityTo ?? "");
    setEditCityFromCountry(day.cityFromCountry ?? "");
    setEditCityToCountry(day.cityToCountry ?? "");
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
        cityFromCountry: editCityFromCountry || null,
        cityToCountry: editCityToCountry || null,
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
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <div
            className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[11px] font-semibold"
            style={{ background: "var(--indigo)", color: "#FAF2EB" }}
          >
            {day.dayNumber}
          </div>
          {dayDateStr && (
            <span className="text-[8px] leading-none text-center" style={{ color: "var(--text-sec)", maxWidth: 36 }}>
              {dayDateStr}
            </span>
          )}
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
            {day.isTransitNight ? (
              <TransitNightBadge />
            ) : hotel && (
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
      <DayPhotoZone
        photoUrl={day.photoUrl}
        editable={canEditDay && !!onSavePhoto}
        onSave={photoUrl => onSavePhoto!(photoUrl)}
        height={134}
        onClick={onToggle}
      >
        <div
          className="absolute top-3 left-3 px-2.5 py-1 rounded-[8px] text-[12px] font-semibold shadow"
          style={{ background: "var(--indigo)", color: "#FAF2EB" }}
        >
          Día {day.dayNumber}
          {dayDateStr && (
            <span className="text-[10px] font-normal ml-1.5 opacity-80">{dayDateStr}</span>
          )}
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
      </DayPhotoZone>

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

      {/* Hotel section — always visible when tripId is set */}
      {tripId && (
        <div className="mx-4 mt-3">
          {hotelNightLabel && (
            <div className="flex items-center gap-1 mb-1.5">
              <NightLabelBadge label={hotelNightLabel} />
            </div>
          )}
          <DayHotelPanel
            entityType="trip"
            entityId={tripId}
            day={day}
            allDays={allDays}
            compact={true}
            readOnly={!canEditHotels}
            transitReadOnly={!canEditHotels}
            travelerTrip
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
                <label className="text-[11px] text-muted-foreground">País origen</label>
                <select
                  className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[var(--indigo)] bg-white"
                  value={editCityFromCountry}
                  onChange={e => setEditCityFromCountry(e.target.value)}
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
                  className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[var(--indigo)] bg-white"
                  value={editCityToCountry}
                  onChange={e => setEditCityToCountry(e.target.value)}
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
          entityId={tripId}
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
