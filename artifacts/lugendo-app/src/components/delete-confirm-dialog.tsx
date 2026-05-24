import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type DeleteEntityType = "hotel" | "activity" | "itinerary" | "trip";

interface UsageData {
  itineraries?: { id: number; name: string }[];
  trips?: { id: number; name: string }[];
  travelers?: { id: number; email: string; status: string }[];
}

const ENTITY_LABEL: Record<DeleteEntityType, string> = {
  hotel: "el hotel",
  activity: "la actividad",
  itinerary: "el itinerario",
  trip: "el viaje",
};

const DEACTIVATE_LABEL: Record<DeleteEntityType, string> = {
  hotel: "Desactivar hotel",
  activity: "Desactivar actividad",
  itinerary: "Desactivar itinerario",
  trip: "Cancelar viaje",
};

const USAGE_LABELS = {
  itineraries: "Itinerarios que lo usan",
  trips: "Viajes que lo usan",
  travelers: "Viajeros asignados",
};

const USAGE_STYLE = {
  itineraries: { background: "#EAE6F5", color: "#3D2F6B" },
  trips: { background: "#FAEEE4", color: "#8B4420" },
  travelers: { background: "#ECD5B8", color: "#7A5C3A" },
};

export function DeleteConfirmDialog({
  entityType,
  entityId,
  entityName,
  onClose,
  onDelete,
  onDeactivate,
  isPendingDelete = false,
  isPendingDeactivate = false,
}: {
  entityType: DeleteEntityType;
  entityId: number;
  entityName: string;
  onClose: () => void;
  onDelete: () => void;
  onDeactivate: () => void;
  isPendingDelete?: boolean;
  isPendingDeactivate?: boolean;
}) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    fetch(`/api/${entityType}s/${entityId}/usage`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUsage(data); })
      .finally(() => setLoadingUsage(false));
  }, [entityType, entityId]);

  const usageCount =
    (usage?.itineraries?.length ?? 0) +
    (usage?.trips?.length ?? 0) +
    (usage?.travelers?.length ?? 0);
  const inUse = usageCount > 0;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#C4793A" }} />
            Eliminar {ENTITY_LABEL[entityType]}
          </DialogTitle>
        </DialogHeader>

        {loadingUsage ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : inUse ? (
          <div className="space-y-3 text-[13px]">
            <p className="text-muted-foreground">
              <strong className="font-medium" style={{ color: "#2D1F0E" }}>"{entityName}"</strong>{" "}
              está siendo utilizado y no puede eliminarse directamente. Puedes desactivarlo para que no aparezca en nuevos viajes.
            </p>

            {(["itineraries", "trips", "travelers"] as const).map(key => {
              const items = usage?.[key];
              if (!items?.length) return null;
              const label = USAGE_LABELS[key];
              const style = USAGE_STYLE[key];
              const showItems = items.slice(0, 5);
              const extra = items.length - 5;
              return (
                <div key={key} className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label} ({items.length})
                  </p>
                  {showItems.map((item: { id: number; name?: string; email?: string; status?: string }) => (
                    <div key={item.id} className="px-2.5 py-1.5 rounded-[6px] text-[12px] font-medium flex items-center justify-between gap-2"
                      style={style}>
                      <span>{item.name ?? item.email}</span>
                      {item.status && (
                        <span className="text-[10px] opacity-60 font-normal">{item.status}</span>
                      )}
                    </div>
                  ))}
                  {extra > 0 && (
                    <p className="text-[11px] text-muted-foreground pl-1">y {extra} más…</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            ¿Seguro que quieres eliminar{" "}
            <strong className="font-medium" style={{ color: "#2D1F0E" }}>"{entityName}"</strong>?{" "}
            Esta acción es irreversible.
          </p>
        )}

        <DialogFooter className="pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}
            disabled={isPendingDelete || isPendingDeactivate}>
            Cancelar
          </Button>
          {!loadingUsage && (
            inUse ? (
              <Button type="button" size="sm" disabled={isPendingDeactivate} onClick={onDeactivate}
                style={{ background: "#3D2F6B", color: "white" }}>
                {isPendingDeactivate ? "Procesando…" : DEACTIVATE_LABEL[entityType]}
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={isPendingDelete} onClick={onDelete}
                className="gap-1.5" style={{ background: "#C0392B", color: "white" }}>
                <Trash2 className="w-3.5 h-3.5" />
                {isPendingDelete ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
