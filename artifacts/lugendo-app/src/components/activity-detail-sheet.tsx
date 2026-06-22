import { useState, useEffect } from "react";
import { Clock, MapPin, Timer, StickyNote, Pencil, Building2, AlarmClock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateTripDayActivity, useUpdateItineraryDayActivity, useUpdateActivity } from "@workspace/api-client-react";
import type { DayActivity } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { categoryMeta } from "@/components/activity-meta";
import { TransportSelect } from "@/components/transport-select";

interface ActivityDetailSheetProps {
  entityType?: "trip" | "itinerary";
  entityId: number;
  dayId: number;
  activity: DayActivity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryKey: string;
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-medium mb-0.5" style={{ color: "var(--text-ter)" }}>{label}</p>
      <p className="text-[13px]" style={{ color: "var(--noche)" }}>{value}</p>
    </div>
  );
}

export function ActivityDetailSheet({
  entityType = "trip",
  entityId,
  dayId,
  activity,
  open,
  onOpenChange,
  queryKey,
}: ActivityDetailSheetProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateTripLink = useUpdateTripDayActivity();
  const updateItinLink = useUpdateItineraryDayActivity();
  const updateActivity = useUpdateActivity();

  const isItinerary = entityType === "itinerary";

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [companyContact, setCompanyContact] = useState("");
  const [addressOverride, setAddressOverride] = useState("");
  const [included, setIncluded] = useState(true);
  const [transportMode, setTransportMode] = useState("");

  const [address, setAddress] = useState("");
  const [durationHours, setDurationHours] = useState("");

  useEffect(() => {
    if (open && activity) {
      setStartTime(activity.startTime ?? "");
      setEndTime(activity.endTime ?? "");
      setNotes(activity.notes ?? "");
      setCompanyContact(activity.companyContact ?? "");
      setAddressOverride(activity.addressOverride ?? "");
      setIncluded(activity.included !== false);
      setTransportMode((activity.transportMode as string) ?? "");
      setAddress(activity.address ?? "");
      setDurationHours(activity.durationHours != null ? String(activity.durationHours) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id]);

  if (!activity) return null;

  const meta = categoryMeta[activity.activityCategory ?? ""] ?? categoryMeta.other;
  const canEdit = activity.canEdit !== false;
  const isPending = updateTripLink.isPending || updateItinLink.isPending || updateActivity.isPending;
  const isAdHoc = activity.activityId == null;

  const handleSave = async () => {
    const catalogChanged = !isAdHoc && (
      address !== (activity.address ?? "") ||
      durationHours !== (activity.durationHours != null ? String(activity.durationHours) : "")
    );

    try {
      if (catalogChanged && activity.activityId != null) {
        await new Promise<void>((resolve, reject) => {
          updateActivity.mutate(
            {
              activityId: activity.activityId!,
              data: {
                ...(address !== (activity.address ?? "") ? { address: address || undefined } : {}),
                ...(durationHours !== (activity.durationHours != null ? String(activity.durationHours) : "")
                  ? { durationHours: durationHours ? parseFloat(durationHours) : undefined }
                  : {}),
              },
            },
            { onSuccess: () => resolve(), onError: reject }
          );
        });
        qc.invalidateQueries({ queryKey: ["/api/activities"] });
      }

      if (isItinerary) {
        await new Promise<void>((resolve, reject) => {
          updateItinLink.mutate(
            {
              itineraryId: entityId,
              dayId,
              linkId: activity.id,
              data: {
                startTime: startTime || null,
                notes: notes || null,
              },
            },
            { onSuccess: () => resolve(), onError: reject }
          );
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          updateTripLink.mutate(
            {
              tripId: entityId,
              dayId,
              linkId: activity.id,
              data: {
                startTime: startTime || null,
                endTime: endTime || null,
                notes: notes || null,
                companyContact: companyContact || null,
                addressOverride: addressOverride || null,
                included,
                transportMode: (transportMode || null) as import("@workspace/api-client-react").DayActivityInput["transportMode"],
              },
            },
            { onSuccess: () => resolve(), onError: reject }
          );
        });
      }

      qc.invalidateQueries({ queryKey: [queryKey] });
      toast({ title: "Actividad actualizada" });
      onOpenChange(false);
    } catch {
      toast({ variant: "destructive", title: "Error al guardar" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{meta.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--noche)" }}>
                  {activity.activityName}
                </SheetTitle>
                {!activity.included && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: "#F0F4F0", color: "#4A6A4A" }}>
                    Por libre
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-ter)" }}>
                {meta.label}
                {!canEdit && " · Solo lectura"}
                {isItinerary && canEdit && " · Itinerario"}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {!canEdit ? (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: "var(--noche)" }}>
                Detalles de la actividad
              </p>
              <ReadOnlyField label="Hora de inicio" value={activity.startTime} />
              <ReadOnlyField label="Hora de fin" value={activity.endTime} />
              <ReadOnlyField label="Empresa / Contacto" value={activity.companyContact} />
              <ReadOnlyField label="Dirección" value={activity.addressOverride ?? activity.address} />
              <ReadOnlyField label="Notas" value={activity.notes} />
              {!activity.included && (
                <div>
                  <p className="text-[11px] font-medium mb-0.5" style={{ color: "var(--text-ter)" }}>Tipo</p>
                  <p className="text-[13px]" style={{ color: "var(--noche)" }}>Por libre (no incluida)</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Catalog-level editable fields (only for catalog-linked activities) */}
              {!isAdHoc && (
                <div className="space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: "var(--noche)" }}>
                    Datos generales de la actividad
                  </p>
                  <div>
                    <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                      <MapPin className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                      Dirección (catálogo)
                    </label>
                    <Input
                      placeholder="Calle, número, ciudad…"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      className="h-9 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                      <Timer className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                      Duración (horas)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="2"
                      value={durationHours}
                      onChange={e => setDurationHours(e.target.value)}
                      className="h-9 text-[13px] w-32"
                    />
                  </div>
                </div>
              )}

              {/* Per-link editable fields */}
              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: "var(--noche)" }}>
                  Detalles para este día
                </p>

                <div className={isItinerary ? "" : "grid grid-cols-2 gap-3"}>
                  <div>
                    <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                      <Clock className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                      Hora de inicio
                    </label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="h-9 text-[13px]"
                    />
                  </div>
                  {!isItinerary && (
                    <div>
                      <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                        <AlarmClock className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                        Hora de fin
                      </label>
                      <Input
                        type="time"
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                        className="h-9 text-[13px]"
                      />
                    </div>
                  )}
                </div>

                {!isItinerary && (
                  <>
                    <div>
                      <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                        <Building2 className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                        Empresa / Contacto
                      </label>
                      <Input
                        placeholder="Nombre del tour, empresa, teléfono…"
                        value={companyContact}
                        onChange={e => setCompanyContact(e.target.value)}
                        className="h-9 text-[13px]"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                        <MapPin className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                        Dirección (para este día)
                      </label>
                      <Input
                        placeholder="Sobreescribe la dirección del catálogo…"
                        value={addressOverride}
                        onChange={e => setAddressOverride(e.target.value)}
                        className="h-9 text-[13px]"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                        Transporte para llegar
                      </label>
                      <TransportSelect
                        value={transportMode}
                        onChange={setTransportMode}
                        placeholder="Sin transporte definido"
                        className="h-9 text-[13px]"
                      />
                    </div>

                    <div>
                      <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                        Tipo de actividad
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIncluded(true)}
                          className="flex-1 h-9 rounded-[8px] text-[12px] font-medium border transition-colors"
                          style={{
                            background: included ? "var(--indigo)" : "transparent",
                            color: included ? "#FAF2EB" : "var(--noche)",
                            borderColor: included ? "var(--indigo)" : "var(--border)",
                          }}
                        >
                          Incluida
                        </button>
                        <button
                          onClick={() => setIncluded(false)}
                          className="flex-1 h-9 rounded-[8px] text-[12px] font-medium border transition-colors"
                          style={{
                            background: !included ? "#4A6A4A" : "transparent",
                            color: !included ? "#fff" : "var(--noche)",
                            borderColor: !included ? "#4A6A4A" : "var(--border)",
                          }}
                        >
                          Por libre
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                    <StickyNote className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                    Notas del día
                  </label>
                  <Textarea
                    placeholder="Punto de encuentro, indicaciones especiales, código de reserva…"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="text-[13px] resize-none"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {canEdit && (
          <div className="px-5 py-4 border-t border-border/60 flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 h-9 rounded-[8px] text-[13px] font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              style={{ background: "var(--indigo)", color: "#FAF2EB" }}
            >
              <Pencil className="w-3.5 h-3.5" />
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 rounded-[8px] text-[13px] font-medium border border-border/60"
              style={{ color: "var(--noche)" }}
            >
              Cancelar
            </button>
          </div>
        )}
        {!canEdit && (
          <div className="px-5 py-4 border-t border-border/60">
            <button
              onClick={() => onOpenChange(false)}
              className="w-full h-9 rounded-[8px] text-[13px] font-medium border border-border/60"
              style={{ color: "var(--noche)" }}
            >
              Cerrar
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
