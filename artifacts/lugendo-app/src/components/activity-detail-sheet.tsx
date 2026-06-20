import { useState, useEffect } from "react";
import { Clock, MapPin, Timer, StickyNote, Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateTripDayActivity, useUpdateActivity } from "@workspace/api-client-react";
import type { DayActivity } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { categoryMeta } from "@/components/day-activities-panel";

interface ActivityDetailSheetProps {
  tripId: number;
  dayId: number;
  activity: DayActivity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryKey: string;
}

export function ActivityDetailSheet({
  tripId,
  dayId,
  activity,
  open,
  onOpenChange,
  queryKey,
}: ActivityDetailSheetProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateLink = useUpdateTripDayActivity();
  const updateActivity = useUpdateActivity();

  // Per-link editable fields
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");

  // Catalog-level editable fields
  const [address, setAddress] = useState("");
  const [durationHours, setDurationHours] = useState("");

  useEffect(() => {
    if (activity) {
      setStartTime(activity.startTime ?? "");
      setNotes(activity.notes ?? "");
      setAddress(activity.address ?? "");
      setDurationHours(activity.durationHours != null ? String(activity.durationHours) : "");
    }
  }, [activity]);

  if (!activity) return null;

  const meta = categoryMeta[activity.activityCategory ?? ""] ?? categoryMeta.other;

  const isPending = updateLink.isPending || updateActivity.isPending;

  const handleSave = async () => {
    const catalogChanged =
      address !== (activity.address ?? "") ||
      durationHours !== (activity.durationHours != null ? String(activity.durationHours) : "");

    try {
      if (catalogChanged) {
        await new Promise<void>((resolve, reject) => {
          updateActivity.mutate(
            {
              activityId: activity.activityId,
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

      await new Promise<void>((resolve, reject) => {
        updateLink.mutate(
          {
            tripId,
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
              <SheetTitle className="text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--noche)" }}>
                {activity.activityName}
              </SheetTitle>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-ter)" }}>
                {meta.label}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Catalog-level editable fields */}
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: "var(--noche)" }}>
              Datos generales de la actividad
            </p>
            <div>
              <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                <MapPin className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                Dirección
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

          {/* Per-link editable fields */}
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50" style={{ color: "var(--noche)" }}>
              Detalles para este día
            </p>

            <div>
              <label className="text-[12px] font-medium flex items-center gap-1.5 mb-1.5" style={{ color: "var(--noche)" }}>
                <Clock className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
                Hora de inicio
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="h-9 text-[13px] w-40"
              />
            </div>

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
        </div>

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
      </SheetContent>
    </Sheet>
  );
}
