import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  useListDayActivities,
  useAddDayActivity,
  useRemoveDayActivity,
  useListActivities,
} from "@workspace/api-client-react";
import type { Activity } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  itineraryId,
  dayId,
  compact = false,
}: {
  itineraryId: number;
  dayId: number;
  compact?: boolean;
}) {
  const { data: dayActivities, isLoading } = useListDayActivities(itineraryId, dayId);
  const { data: allActivities } = useListActivities();
  const addActivity = useAddDayActivity();
  const removeActivity = useRemoveDayActivity();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");

  const linkedIds = new Set((dayActivities ?? []).map(a => a.activityId));
  const availableActivities = (allActivities ?? []).filter(a => !linkedIds.has(a.id));

  const handleAdd = () => {
    if (!selectedActivityId || selectedActivityId === "none") return;
    addActivity.mutate(
      { itineraryId, dayId, data: { activityId: parseInt(selectedActivityId) } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days/${dayId}/activities`] });
          setSelectedActivityId("");
          toast({ title: "Actividad vinculada" });
        },
        onError: () => toast({ variant: "destructive", title: "Error al vincular actividad" }),
      }
    );
  };

  const handleRemove = (linkId: number) => {
    removeActivity.mutate(
      { itineraryId, dayId, linkId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days/${dayId}/activities`] });
          toast({ title: "Actividad desvinculada" });
        },
        onError: () => toast({ variant: "destructive", title: "Error al desvincular" }),
      }
    );
  };

  return (
    <div className={compact ? "space-y-2" : "mt-3 pt-3 border-t border-border/60"}>
      {!compact && (
        <div className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#9C7A58" }}>
          Actividades del día
        </div>
      )}

      {isLoading ? (
        <div className="text-[11px] text-muted-foreground">Cargando…</div>
      ) : (
        <>
          {dayActivities && dayActivities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {dayActivities.map(a => {
                const meta = categoryMeta[a.activityCategory ?? ""] ?? categoryMeta.other;
                return (
                  <span key={a.id}
                    className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full text-[11px] font-medium border border-border bg-card">
                    {meta.emoji} {a.activityName}
                    <button
                      onClick={() => handleRemove(a.id)}
                      className="ml-0.5 text-muted-foreground hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {availableActivities.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={selectedActivityId} onValueChange={setSelectedActivityId}>
                <SelectTrigger className="h-7 text-[11px] w-52">
                  <SelectValue placeholder="Añadir actividad…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar actividad</SelectItem>
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
              <button
                onClick={handleAdd}
                disabled={!selectedActivityId || selectedActivityId === "none" || addActivity.isPending}
                className="h-7 px-3 rounded-[6px] text-[11px] font-medium disabled:opacity-40"
                style={{ background: "#EAE6F5", color: "#3D2F6B" }}>
                <Plus className="w-3 h-3 inline mr-0.5" />Vincular
              </button>
            </div>
          )}
          {availableActivities.length === 0 && !dayActivities?.length && (
            <div className="text-[11px] text-muted-foreground italic">
              No hay actividades en el catálogo.{" "}
              <a href="/activities" className="underline hover:no-underline" style={{ color: "#C4793A" }}>
                Añade actividades
              </a>{" "}
              primero.
            </div>
          )}
        </>
      )}
    </div>
  );
}
