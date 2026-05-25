import { useState } from "react";
import { Plus, X, Clock, StickyNote } from "lucide-react";
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
import type { Activity } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export const categoryMeta: Record<string, { emoji: string; label: string }> = {
  cultural:    { emoji: "🏛️", label: "Cultural" },
  gastronomic: { emoji: "🍽️", label: "Gastronómica" },
  adventure:   { emoji: "🧗", label: "Aventura" },
  nature:      { emoji: "🌿", label: "Naturaleza" },
  beach:       { emoji: "🏖️", label: "Playa" },
  city:        { emoji: "🏙️", label: "Ciudad" },
  excursion:   { emoji: "🚌", label: "Excursión" },
  other:       { emoji: "⭐", label: "Otros" },
};

export function DayActivitiesPanel({
  entityType,
  entityId,
  dayId,
  compact = false,
}: {
  entityType: "itinerary" | "trip";
  entityId: number;
  dayId: number;
  compact?: boolean;
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
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const linkedIds = new Set((dayActivities ?? []).map(a => a.activityId));
  const availableActivities = (allActivities ?? []).filter(a => !linkedIds.has(a.id));

  const resetForm = () => {
    setMode("idle");
    setSelectedActivityId(""); setStartTime(""); setNotes("");
    setNewName(""); setNewCategory(""); setNewStartTime(""); setNewNotes("");
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const doAdd = (activityId: number, st?: string, n?: string, cb?: () => void) => {
    const data = {
      activityId,
      ...(st ? { startTime: st } : {}),
      ...(n ? { notes: n } : {}),
    };
    const successCb = { onSuccess: () => { invalidate(); cb?.(); }, onError: () => toast({ variant: "destructive", title: "Error al añadir actividad" }) };
    if (isItinerary) {
      addItin.mutate({ itineraryId: entityId, dayId, data }, successCb);
    } else {
      addTrip.mutate({ tripId: entityId, dayId, data }, successCb);
    }
  };

  const doRemove = (linkId: number) => {
    const successCb = { onSuccess: invalidate, onError: () => toast({ variant: "destructive", title: "Error al eliminar actividad" }) };
    if (isItinerary) {
      removeItin.mutate({ itineraryId: entityId, dayId, linkId }, successCb);
    } else {
      removeTrip.mutate({ tripId: entityId, dayId, linkId }, successCb);
    }
  };

  const handleLink = () => {
    if (!selectedActivityId || selectedActivityId === "none") return;
    doAdd(parseInt(selectedActivityId), startTime || undefined, notes || undefined, () => {
      toast({ title: "Actividad añadida" });
      resetForm();
    });
  };

  const handleCreateAndLink = () => {
    if (!newName.trim()) return;
    createActivity.mutate(
      { data: { name: newName.trim(), ...(newCategory ? { category: newCategory as "cultural" | "gastronomic" | "adventure" | "nature" | "beach" | "city" | "excursion" | "other" } : {}) } },
      {
        onSuccess: (created) => {
          qc.invalidateQueries({ queryKey: ["/api/activities"] });
          doAdd(created.id, newStartTime || undefined, newNotes || undefined, () => {
            toast({ title: "Actividad creada y añadida" });
            resetForm();
          });
        },
        onError: () => toast({ variant: "destructive", title: "Error al crear la actividad" }),
      }
    );
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
              onClick={() => setMode("create")}
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
            <div className="space-y-1.5 mb-3">
              {dayActivities.map(a => {
                const meta = categoryMeta[a.activityCategory ?? ""] ?? categoryMeta.other;
                return (
                  <div key={a.id}
                    className="flex items-start gap-2 px-2.5 py-2 rounded-[8px] border border-border/60 bg-card">
                    <span className="text-base leading-none mt-0.5">{meta.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>{a.activityName}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {a.startTime && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="w-3 h-3" />{a.startTime}
                          </span>
                        )}
                        {a.notes && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <StickyNote className="w-3 h-3" />
                            <span className="truncate max-w-[200px]">{a.notes}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => doRemove(a.id)}
                      className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0 mt-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {mode === "link" && (
            <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#FAF8FF" }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#3D2F6B" }}>Vincular actividad existente</p>
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

          {mode === "create" && (
            <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#FAEEE4" }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#C4793A" }}>Nueva actividad</p>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Nombre *</label>
                <Input placeholder="Visita guiada a la Medina…" value={newName} onChange={e => setNewName(e.target.value)} className="h-8 text-[12px]" />
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
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Hora de inicio</label>
                <Input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} className="h-8 text-[12px] w-36" />
              </div>
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
