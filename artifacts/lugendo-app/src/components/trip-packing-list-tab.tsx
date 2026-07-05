import { useState } from "react";
import { Luggage, Plus, Trash2, Sparkles, User as UserIcon, Shirt, Droplets, FileText, Plug, Bike } from "lucide-react";
import {
  useGetMyTripPackingList, useCreateTripPackingItem, useUpdateTripPackingItem, useDeleteTripPackingItem,
} from "@workspace/api-client-react";
import type { TripPackingItem, TripPackingItemCategory } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TripPackingListTabProps {
  tripId: number;
}

const CATEGORY_META: Record<TripPackingItemCategory, { label: string; icon: typeof Shirt }> = {
  ropa: { label: "Ropa", icon: Shirt },
  higiene: { label: "Higiene", icon: Droplets },
  documentos: { label: "Documentos", icon: FileText },
  electronica: { label: "Electrónica", icon: Plug },
  actividades: { label: "Actividades", icon: Bike },
  otros: { label: "Otros", icon: Luggage },
};

const CATEGORY_ORDER: TripPackingItemCategory[] = ["documentos", "ropa", "higiene", "electronica", "actividades", "otros"];

export function TripPackingListTab({ tripId }: TripPackingListTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: items, isLoading } = useGetMyTripPackingList(tripId);
  const createItem = useCreateTripPackingItem();
  const updateItem = useUpdateTripPackingItem();
  const deleteItem = useDeleteTripPackingItem();

  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<TripPackingItemCategory>("otros");

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/packing-list`] });

  const handleAddPersonal = () => {
    if (!newTitle.trim()) return;
    createItem.mutate(
      { tripId, data: { title: newTitle.trim(), category: newCategory } },
      {
        onSuccess: () => { invalidate(); setNewTitle(""); },
        onError: () => toast({ variant: "destructive", title: "Error al añadir el elemento" }),
      }
    );
  };

  const handleToggleItem = (item: TripPackingItem) => {
    updateItem.mutate(
      { tripId, itemId: item.id, data: { packed: !item.packed } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ variant: "destructive", title: "Error al actualizar el elemento" }),
      }
    );
  };

  const handleDeleteItem = (item: TripPackingItem) => {
    if (!window.confirm(`¿Eliminar "${item.title}"?`)) return;
    deleteItem.mutate(
      { tripId, itemId: item.id },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ variant: "destructive", title: "Error al eliminar el elemento" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-16 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-16 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  const allItems = items ?? [];
  const total = allItems.length;
  const packed = allItems.filter(i => i.packed).length;
  const progress = total > 0 ? Math.round((packed / total) * 100) : 0;

  const byCategory = CATEGORY_ORDER
    .map(category => ({ category, items: allItems.filter(i => i.category === category) }))
    .filter(group => group.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-[14px] p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--terra)" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
              Equipaje sugerido para tu viaje
            </p>
          </div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--terra)" }}>{progress}%</p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--terra)" }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">{packed} de {total} elementos empaquetados</p>
      </div>

      {total === 0 ? (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center">
          <Luggage className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--terra)" }} />
          <p className="text-sm text-muted-foreground">
            La lista de equipaje se generará automáticamente para este viaje
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {byCategory.map(group => {
            const meta = CATEGORY_META[group.category];
            const Icon = meta.icon;
            return (
              <div key={group.category} className="bg-card border border-border rounded-[14px] p-4 space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3.5 h-3.5" style={{ color: "var(--indigo)" }} />
                  <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{meta.label}</p>
                </div>
                {group.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-1">
                    <Checkbox
                      checked={item.packed}
                      onCheckedChange={() => handleToggleItem(item)}
                    />
                    <span
                      className="flex-1 text-[13px] truncate"
                      style={{
                        color: item.packed ? "var(--muted-foreground)" : "var(--noche)",
                        textDecoration: item.packed ? "line-through" : "none",
                      }}
                    >
                      {item.title}
                    </span>
                    <button
                      onClick={() => handleDeleteItem(item)}
                      className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors shrink-0"
                      title="Eliminar elemento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <UserIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Input
          placeholder="Añadir elemento propio…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAddPersonal(); }}
          className="h-9 text-[13px]"
        />
        <Select value={newCategory} onValueChange={v => setNewCategory(v as TripPackingItemCategory)}>
          <SelectTrigger className="h-9 text-[12px] w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_ORDER.map(category => (
              <SelectItem key={category} value={category}>{CATEGORY_META[category].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
