import { useMemo, useState } from "react";
import { ListChecks, Plus, Trash2, Sparkles, Building2, User as UserIcon } from "lucide-react";
import {
  useGetMyTripChecklist, useGetTripChecklistSuggestions, useCreateTripChecklist,
  useCreateTripChecklistItem, useUpdateTripChecklistItem, useDeleteTripChecklistItem,
} from "@workspace/api-client-react";
import type { TripChecklistItem, TripChecklistItemOrigin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface TripChecklistTabProps {
  tripId: number;
}

const ORIGIN_LABEL: Record<TripChecklistItemOrigin, { label: string; bg: string; color: string }> = {
  suggested: { label: "Sugerido", bg: "rgba(196,121,58,0.10)", color: "var(--terra)" },
  agency: { label: "Agencia", bg: "rgba(61,47,107,0.08)", color: "var(--indigo)" },
  personal: { label: "Personal", bg: "rgba(45,31,14,0.06)", color: "var(--noche)" },
};

function OriginBadge({ origin }: { origin: TripChecklistItemOrigin }) {
  const meta = ORIGIN_LABEL[origin];
  return (
    <span
      className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

export function TripChecklistTab({ tripId }: TripChecklistTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: items, isLoading } = useGetMyTripChecklist(tripId);
  const { data: suggestions, isLoading: suggestionsLoading } = useGetTripChecklistSuggestions(tripId);
  const createChecklist = useCreateTripChecklist();
  const createItem = useCreateTripChecklistItem();
  const updateItem = useUpdateTripChecklistItem();
  const deleteItem = useDeleteTripChecklistItem();

  const [selectedSuggested, setSelectedSuggested] = useState<Set<string>>(new Set());
  const [selectedAgency, setSelectedAgency] = useState<Set<number>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/checklist`] });

  if (suggestions && !initialized) {
    setInitialized(true);
    setSelectedSuggested(new Set(suggestions.suggested));
    setSelectedAgency(new Set(suggestions.agency.map(t => t.id)));
  }

  const toggleSuggested = (title: string) => {
    setSelectedSuggested(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };

  const toggleAgency = (id: number) => {
    setSelectedAgency(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreateChecklist = () => {
    const suggestedItems = (suggestions?.suggested ?? [])
      .filter(t => selectedSuggested.has(t))
      .map(title => ({ title, origin: "suggested" as const }));
    const agencyItems = (suggestions?.agency ?? [])
      .filter(t => selectedAgency.has(t.id))
      .map(t => ({ title: t.title, origin: "agency" as const, templateId: t.id }));
    const payload = [...suggestedItems, ...agencyItems];
    if (payload.length === 0) {
      toast({ variant: "destructive", title: "Selecciona al menos una tarea" });
      return;
    }
    createChecklist.mutate(
      { tripId, data: { items: payload } },
      {
        onSuccess: () => { invalidate(); toast({ title: "Checklist creado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al crear el checklist" }),
      }
    );
  };

  const handleAddPersonal = () => {
    if (!newTitle.trim()) return;
    createItem.mutate(
      { tripId, data: { title: newTitle.trim() } },
      {
        onSuccess: () => { invalidate(); setNewTitle(""); },
        onError: () => toast({ variant: "destructive", title: "Error al añadir la tarea" }),
      }
    );
  };

  const handleToggleItem = (item: TripChecklistItem) => {
    updateItem.mutate(
      { tripId, itemId: item.id, data: { completed: !item.completed } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ variant: "destructive", title: "Error al actualizar la tarea" }),
      }
    );
  };

  const handleDeleteItem = (item: TripChecklistItem) => {
    if (!window.confirm(`¿Eliminar "${item.title}"?`)) return;
    deleteItem.mutate(
      { tripId, itemId: item.id },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ variant: "destructive", title: "Error al eliminar la tarea" }),
      }
    );
  };

  const progress = useMemo(() => {
    if (!items || items.length === 0) return 0;
    const completed = items.filter(i => i.completed).length;
    return Math.round((completed / items.length) * 100);
  }, [items]);

  if (isLoading || (items && items.length === 0 && suggestionsLoading)) {
    return (
      <div className="space-y-2">
        <div className="h-16 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-16 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  // ── Empty state: creation flow ────────────────────────────────────────────
  if (!items || items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-[14px] p-5 space-y-1">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4.5 h-4.5" style={{ color: "var(--terra)" }} />
            <p className="text-[14px] font-medium" style={{ color: "var(--noche)" }}>
              Crea tu checklist de viaje
            </p>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Selecciona las tareas que quieres llevar bajo control antes de tu viaje. Podrás añadir más después.
          </p>
        </div>

        <div className="bg-card border border-border rounded-[14px] p-4 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Sugeridas</p>
          </div>
          {(suggestions?.suggested ?? []).map(title => (
            <label key={title} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
              <Checkbox
                checked={selectedSuggested.has(title)}
                onCheckedChange={() => toggleSuggested(title)}
              />
              <span className="text-[13px]" style={{ color: "var(--noche)" }}>{title}</span>
            </label>
          ))}
        </div>

        {suggestions && suggestions.agency.length > 0 && (
          <div className="bg-card border border-border rounded-[14px] p-4 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="w-3.5 h-3.5" style={{ color: "var(--indigo)" }} />
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">De tu agencia</p>
            </div>
            {suggestions.agency.map(t => (
              <label key={t.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                <Checkbox
                  checked={selectedAgency.has(t.id)}
                  onCheckedChange={() => toggleAgency(t.id)}
                />
                <span className="text-[13px]" style={{ color: "var(--noche)" }}>{t.title}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleCreateChecklist}
            disabled={createChecklist.isPending}
            style={{ background: "var(--terra)", color: "#fff" }}
          >
            {createChecklist.isPending ? "Creando…" : "Crear checklist"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Checklist view ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-[14px] p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>Progreso</p>
          <p className="text-[13px] font-semibold" style={{ color: "var(--terra)" }}>{progress}%</p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--terra)" }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-3 p-3 rounded-[14px] border border-border bg-card">
            <Checkbox
              checked={item.completed}
              onCheckedChange={() => handleToggleItem(item)}
            />
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span
                className="text-[13px] truncate"
                style={{
                  color: item.completed ? "var(--muted-foreground)" : "var(--noche)",
                  textDecoration: item.completed ? "line-through" : "none",
                }}
              >
                {item.title}
              </span>
              <OriginBadge origin={item.origin} />
            </div>
            <button
              onClick={() => handleDeleteItem(item)}
              className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors shrink-0"
              title="Eliminar tarea"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <UserIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Input
          placeholder="Añadir tarea personal…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAddPersonal(); }}
          className="h-9 text-[13px]"
        />
        <Button
          size="sm"
          onClick={handleAddPersonal}
          disabled={!newTitle.trim() || createItem.isPending}
          style={{ background: "var(--terra)", color: "#fff" }}
          className="h-9 gap-1.5 text-[12px] shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir
        </Button>
      </div>
    </div>
  );
}
