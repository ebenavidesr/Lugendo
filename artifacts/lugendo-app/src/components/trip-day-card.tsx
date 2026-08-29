import { useEffect, useRef, useState } from "react";
import { Hotel, ChevronRight, ChevronUp, X, Plus, Pencil, Trash2, Loader2, ChevronDown } from "lucide-react";
import type { TripDay, TripDayActivityItem, DayActivity } from "@workspace/api-client-react";
import { useRemoveTripDayActivity, COUNTRIES } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getTransportOption, TRANSPORT_OPTIONS } from "@/components/transport-select";
import { FreeActivitySheet } from "@/components/free-activity-sheet";
import { ActivityDetailSheet } from "@/components/activity-detail-sheet";
import { DayHotelPanel, TransitNightBadge, getNightLabel, NightLabelBadge } from "@/components/day-hotel-panel";
import { DayPhotoZone } from "@/components/day-photo-editor";

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
  const [openActivityIds, setOpenActivityIds] = useState<Set<number>>(new Set());
  const toggleActivity = (id: number) => {
    setOpenActivityIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [dayEditOpen, setDayEditOpen] = useState(false);
  const [editCityFrom, setEditCityFrom] = useState(day.cityFrom ?? "");
  const [editCityTo, setEditCityTo] = useState(day.cityTo ?? "");
  const [editCityFromCountry, setEditCityFromCountry] = useState(day.cityFromCountry ?? "");
  const [editCityToCountry, setEditCityToCountry] = useState(day.cityToCountry ?? "");
  const isValidTransport = (v: string | null | undefined) => TRANSPORT_OPTIONS.some(o => o.value === v);
  const [editTransport, setEditTransport] = useState(isValidTransport(day.transport) ? (day.transport ?? "") : "");
  const [editDescription, setEditDescription] = useState(day.description ?? "");
  const [savingDay, setSavingDay] = useState(false);
  const dayEditFormRef = useRef<HTMLDivElement>(null);

  const openDayEdit = () => {
    setEditCityFrom(day.cityFrom ?? "");
    setEditCityTo(day.cityTo ?? "");
    setEditCityFromCountry(day.cityFromCountry ?? "");
    setEditCityToCountry(day.cityToCountry ?? "");
    setEditTransport(isValidTransport(day.transport) ? (day.transport ?? "") : "");
    setEditDescription(day.description ?? "");
    setDayEditOpen(true);
  };

  // The form renders after the day's full activity list, which can push it well off-screen on
  // mobile -- tapping the edit pencil near the photo otherwise looks like it does nothing.
  useEffect(() => {
    if (dayEditOpen) dayEditFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [dayEditOpen]);

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
        className="w-full flex items-center gap-3 px-4 border border-border rounded-[14px] text-left hover:bg-muted/40 transition-colors"
        style={{ minHeight: 44, background: "white" }}
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
    <div className="border border-border rounded-[18px] overflow-hidden" style={{ background: "white" }}>
      {/* Day row: square photo + header, side by side on desktop, stacked on mobile */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 p-4">
        <div className="relative shrink-0">
          <DayPhotoZone
            photoUrl={day.photoUrl}
            editable={canEditDay && !!onSavePhoto}
            onSave={photoUrl => onSavePhoto!(photoUrl)}
            square={140}
            onClick={onToggle}
            className="rounded-[10px]"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {canEditDay && (
                <button
                  onClick={e => { e.stopPropagation(); openDayEdit(); }}
                  className="shrink-0 p-1 -m-1 rounded-[6px] transition-colors hover:bg-muted/40"
                  style={{ color: "var(--ocre)" }}
                  title="Editar día"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="text-[12px] font-medium uppercase tracking-[0.5px]" style={{ color: "var(--terra)" }}>
                Día {day.dayNumber}
              </span>
              <span className="text-[12px]" style={{ color: "var(--ocre)" }}>
                {dayDateStr && `· ${dayDateStr} `}
                {(day.cityTo ?? day.cityFrom) && `· ${day.cityTo ?? day.cityFrom}`}
              </span>
            </div>
            <button
              onClick={onToggle}
              className="shrink-0 p-1.5 -m-1.5 rounded-[8px] opacity-70 hover:opacity-100 hover:bg-muted/40 transition-all"
              style={{ color: "var(--ocre)" }}
              title="Colapsar día"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          <h3 className="text-[17px] font-medium mt-1" style={{ color: "var(--noche)" }}>
            {dayTitle(day)}
          </h3>
          {day.description && (
            <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--noche)" }}>
              {day.description}
            </p>
          )}

        {/* Hotel section — always visible when tripId is set */}
        {tripId && (
          <div className="mt-3">
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
  
        {/* Activities */}
        {activities.length > 0 && (
          <div className="mt-1">
            <ul className="list-none m-0 p-0">
              {activities.map((activity, idx) => {
                const timeRange = formatTimeRange(activity.startTime, activity.endTime);
                const isFree = !activity.included;
                const transportOpt = getTransportOption(activity.transportMode);
                const canDelete = activity.canEdit && tripId != null;
                const canEdit = activity.canEdit && tripId != null;
                const isOpen = openActivityIds.has(activity.id);
                const address = activity.addressOverride ?? activity.address;
                const hasDetail = !!(activity.description || activity.companyContact || address || activity.notes || (isFree && activity.costAmount != null));
  
                return (
                  <li key={activity.id} className={idx > 0 ? "border-t" : ""} style={{ borderColor: "var(--arena)" }}>
                    {/* Transport separator before this activity (skip first) */}
                    {idx > 0 && transportOpt && (
                      <div className="flex items-center gap-2 py-1.5">
                        <span className="text-[13px]">{transportOpt.icon}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-ter)" }}>
                          {transportOpt.label}
                        </span>
                      </div>
                    )}
  
                    {/* Activity row -- collapsed to one line, expands individually on click */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => hasDetail && toggleActivity(activity.id)}
                      onKeyDown={e => { if (hasDetail && (e.key === "Enter" || e.key === " ")) toggleActivity(activity.id); }}
                      className="flex items-center gap-2.5 py-2.5"
                      style={{ minHeight: 44, cursor: hasDetail ? "pointer" : "default" }}
                    >
                      {activity.included ? (
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
                          {activity.isMine ? "Mi actividad" : "Por libre"}
                        </span>
                      )}
                      <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums" style={{ color: "var(--ocre)" }}>
                        {timeRange || "—"}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-[13.5px]" style={{ color: "var(--noche)" }}>
                        {activity.activityName}
                      </span>
                      {canEdit && (
                        <button
                          onClick={e => { e.stopPropagation(); setEditActivity(activity); setEditSheetOpen(true); }}
                          className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                          style={{ color: "var(--ocre)" }}
                          title="Editar actividad"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={e => { e.stopPropagation(); handleRemoveActivity(activity.id); }}
                          className="shrink-0 p-0.5 opacity-60 hover:opacity-100 hover:text-red-500 transition-colors"
                          style={{ color: "var(--ocre)" }}
                          title="Eliminar actividad"
                        >
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
  
                    {/* Expanded detail */}
                    {isOpen && hasDetail && (
                      <div className="pb-4 pl-0 sm:pl-12 animate-in fade-in duration-150">
                        {activity.description && (
                          <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--noche)" }}>
                            {activity.description}
                          </p>
                        )}
                        <div className="flex flex-col gap-2">
                          {address && (
                            <div className="flex gap-2 text-[12.5px]">
                              <span className="shrink-0" style={{ color: "var(--ocre)", minWidth: 68 }}>Dirección</span>
                              <span style={{ color: "var(--noche)" }}>{address}</span>
                            </div>
                          )}
                          {isFree && activity.costAmount != null && (
                            <div className="flex gap-2 text-[12.5px]">
                              <span className="shrink-0" style={{ color: "var(--ocre)", minWidth: 68 }}>Coste</span>
                              <span style={{ color: "var(--noche)" }}>{activity.costAmount.toFixed(2)} {activity.costCurrency ?? "EUR"} por persona</span>
                            </div>
                          )}
                          {activity.companyContact && (
                            <div className="flex gap-2 text-[12.5px]">
                              <span className="shrink-0" style={{ color: "var(--ocre)", minWidth: 68 }}>Contacto</span>
                              <span style={{ color: "var(--noche)" }}>{activity.companyContact}</span>
                            </div>
                          )}
                        </div>
                        {activity.notes && (
                          <div className="mt-2.5 px-2.5 py-2 rounded-[7px] text-[12px] leading-relaxed" style={{ background: "var(--arena)", color: "var(--ocre)" }}>
                            {activity.notes}
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
  
        {/* Add free activity button (traveler view) */}
        {tripId && (
          <div className="mt-3">
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
          <p className="pt-2 pb-0 text-[12px] italic" style={{ color: "var(--text-ter)" }}>
            Sin actividades ni alojamiento para este día.
          </p>
        )}
        </div>
      </div>

      {/* Inline day edit form */}
      {canEditDay && dayEditOpen && (
        <div ref={dayEditFormRef} className="mx-4 mt-3 border border-[var(--indigo)]/30 rounded-[12px] overflow-hidden">
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
          days={allDays.map(d => ({ id: d.id, dayNumber: d.dayNumber }))}
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
