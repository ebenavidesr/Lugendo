import {
  useListTravelerTagCatalog, useListMyTravelerTags, useAddMyTravelerTag, useRemoveMyTravelerTag,
  ApiError,
} from "@workspace/api-client-react";
import type { TravelerTagCatalogEntry, TravelerTagConflict } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const AXIS_LIMITS = { estilo: 2, intereses: 8 } as const;

const FAMILY_LABELS: Record<string, string> = {
  naturaleza: "Naturaleza y aire libre",
  cultura: "Cultura e historia",
  ciudad: "Ciudad y ocio",
  personal: "Enfoque personal",
};

function groupByFamily(entries: TravelerTagCatalogEntry[]): [string, TravelerTagCatalogEntry[]][] {
  const groups = new Map<string, TravelerTagCatalogEntry[]>();
  for (const entry of entries) {
    const key = entry.family ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  return [...groups.entries()];
}

export function TravelerTagSelector() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: catalog = [], isLoading: catalogLoading } = useListTravelerTagCatalog();
  const { data: myTags = [], isLoading: tagsLoading } = useListMyTravelerTags();

  const invalidateTags = () => qc.invalidateQueries({ queryKey: ["/api/me/travel-profile/tags"] });

  const addTag = useAddMyTravelerTag({ mutation: { onSuccess: invalidateTags } });
  const removeTag = useRemoveMyTravelerTag({ mutation: { onSuccess: invalidateTags } });

  if (catalogLoading || tagsLoading) {
    return <div className="h-40 bg-card border border-border rounded-[14px] animate-pulse" />;
  }

  const selectedIds = new Set(myTags.map(t => t.id));
  const countByAxis = { estilo: 0, intereses: 0 };
  for (const t of myTags) countByAxis[t.axis as "estilo" | "intereses"]++;

  const toggle = (entry: TravelerTagCatalogEntry) => {
    if (selectedIds.has(entry.id)) {
      removeTag.mutate({ tagId: entry.id });
      return;
    }
    if (countByAxis[entry.axis as "estilo" | "intereses"] >= AXIS_LIMITS[entry.axis as "estilo" | "intereses"]) {
      toast({
        title: entry.axis === "estilo" ? "Máximo 2 etiquetas de estilo" : "Máximo 8 etiquetas de intereses",
        variant: "destructive",
      });
      return;
    }
    addTag.mutate({ data: { tagId: entry.id } }, {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          const data = err.data as TravelerTagConflict | null;
          if (data?.error === "LimitExceeded") {
            toast({ title: `Máximo ${data.limit} etiquetas en este eje`, variant: "destructive" });
            return;
          }
        }
        toast({ title: "No se pudo añadir la etiqueta", variant: "destructive" });
      },
    });
  };

  const estiloEntries = catalog.filter(e => e.axis === "estilo");
  const interesesEntries = catalog.filter(e => e.axis === "intereses");

  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Estilo de viaje</h3>
          <span className="text-[11px] text-muted-foreground">{countByAxis.estilo}/{AXIS_LIMITS.estilo}</span>
        </div>
        <TagGrid entries={estiloEntries} selectedIds={selectedIds} onToggle={toggle} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Intereses</h3>
          <span className="text-[11px] text-muted-foreground">{countByAxis.intereses}/{AXIS_LIMITS.intereses}</span>
        </div>
        {groupByFamily(interesesEntries).map(([family, entries]) => (
          <div key={family} className="space-y-2.5">
            <h4 className="text-[12px] uppercase tracking-wider text-muted-foreground">{FAMILY_LABELS[family] ?? family}</h4>
            <TagGrid entries={entries} selectedIds={selectedIds} onToggle={toggle} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TagGrid({
  entries, selectedIds, onToggle,
}: {
  entries: TravelerTagCatalogEntry[];
  selectedIds: Set<number>;
  onToggle: (entry: TravelerTagCatalogEntry) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {entries.map(entry => {
        const selected = selectedIds.has(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onToggle(entry)}
            className={cn(
              "text-left rounded-[12px] border px-3 py-2.5 transition-colors",
              selected
                ? "border-transparent bg-[#3D2F6B] text-white"
                : "border-border bg-card hover:border-[#3D2F6B]/40",
            )}
          >
            <p className="text-[13px] font-medium">{entry.label}</p>
            <p className={cn("text-[11px] mt-0.5", selected ? "text-white/75" : "text-muted-foreground")}>
              {entry.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
