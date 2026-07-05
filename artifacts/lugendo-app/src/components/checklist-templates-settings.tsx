import { useState } from "react";
import { ListChecks, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  useListChecklistTemplates, useCreateChecklistTemplate,
  useUpdateChecklistTemplate, useDeleteChecklistTemplate,
} from "@workspace/api-client-react";
import type { ChecklistTemplate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function ChecklistTemplatesSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: templates, isLoading } = useListChecklistTemplates();
  const createTemplate = useCreateChecklistTemplate();
  const updateTemplate = useUpdateChecklistTemplate();
  const deleteTemplate = useDeleteChecklistTemplate();

  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/checklist-templates"] });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createTemplate.mutate(
      { data: { title: newTitle.trim() } },
      {
        onSuccess: () => { invalidate(); setNewTitle(""); toast({ title: "Plantilla creada" }); },
        onError: () => toast({ variant: "destructive", title: "Error al crear la plantilla" }),
      }
    );
  };

  const handleToggleActive = (t: ChecklistTemplate) => {
    updateTemplate.mutate(
      { templateId: t.id, data: { active: !t.active } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ variant: "destructive", title: "Error al actualizar la plantilla" }),
      }
    );
  };

  const handleStartEdit = (t: ChecklistTemplate) => {
    setEditingId(t.id);
    setEditTitle(t.title);
  };

  const handleSaveEdit = (id: number) => {
    if (!editTitle.trim()) return;
    updateTemplate.mutate(
      { templateId: id, data: { title: editTitle.trim() } },
      {
        onSuccess: () => { invalidate(); setEditingId(null); },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar la plantilla" }),
      }
    );
  };

  const handleDelete = (t: ChecklistTemplate) => {
    if (!window.confirm(`¿Eliminar la plantilla "${t.title}"?`)) return;
    deleteTemplate.mutate(
      { templateId: t.id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Plantilla eliminada" }); },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar la plantilla" }),
      }
    );
  };

  return (
    <div className="rounded-[14px] border border-border p-5 space-y-4" style={{ background: "white" }}>
      <div className="flex items-center gap-2 mb-1">
        <ListChecks className="w-4 h-4" style={{ color: "#C4793A" }} />
        <span className="text-[13px] font-semibold" style={{ color: "#2D1F0E" }}>Plantillas de checklist</span>
      </div>
      <p className="text-[12px] text-muted-foreground -mt-1">
        Estas tareas se ofrecerán como sugerencias de la agencia cuando un viajero cree el checklist de su viaje.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-10 bg-muted/40 rounded-[10px] animate-pulse" />
          <div className="h-10 bg-muted/40 rounded-[10px] animate-pulse" />
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-[10px] border border-border">
              {editingId === t.id ? (
                <>
                  <Input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="h-8 text-[13px] flex-1"
                    autoFocus
                  />
                  <button
                    type="button"
                    aria-label="Cancelar"
                    title="Cancelar"
                    onClick={() => setEditingId(null)}
                    className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Guardar"
                    title="Guardar"
                    onClick={() => handleSaveEdit(t.id)}
                    disabled={!editTitle.trim()}
                    className="p-1.5 rounded-[8px] transition-colors"
                    style={{ color: "var(--terra)" }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[13px]" style={{ color: t.active ? "#2D1F0E" : "#9C9184" }}>
                    {t.title}
                  </span>
                  <Switch checked={t.active} onCheckedChange={() => handleToggleActive(t)} />
                  <button
                    onClick={() => handleStartEdit(t)}
                    className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground py-2">No hay plantillas de checklist aún.</p>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <Input
          placeholder="Nueva plantilla (ej. Visado, Cambio de divisa)…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
          className="h-9 text-[13px] mt-3"
        />
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!newTitle.trim() || createTemplate.isPending}
          style={{ background: "var(--terra)", color: "#fff" }}
          className="h-9 mt-3 gap-1.5 text-[12px] shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir
        </Button>
      </div>
    </div>
  );
}
