import { useState } from "react";
import { Plus, Clock, Users, Euro } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListActivities, useCreateActivity, useDeleteActivity } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Activity, ActivityInputCategory } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const categoryMeta: Record<string, { label: string; bg: string; color: string; emoji: string }> = {
  cultural:    { label: "Cultural",     bg: "#EAE6F5", color: "#3D2F6B", emoji: "🏛️" },
  gastronomic: { label: "Gastronómica", bg: "#FFF3D6", color: "#C47A00", emoji: "🍽️" },
  adventure:   { label: "Aventura",     bg: "#FDECEA", color: "#C0392B", emoji: "🧗" },
  nature:      { label: "Naturaleza",   bg: "#E4F3EC", color: "#2E7D5A", emoji: "🌿" },
  beach:       { label: "Playa",        bg: "#E0F0FF", color: "#1A6FA8", emoji: "🏖️" },
  city:        { label: "Ciudad",       bg: "#ECD5B8", color: "#7A5C3A", emoji: "🏙️" },
  excursion:   { label: "Excursión",    bg: "#FAEEE4", color: "#8B4420", emoji: "🚌" },
  other:       { label: "Otros",        bg: "#E5D4BF", color: "#9C7A58", emoji: "⭐" },
};

function CategoryBadge({ category }: { category: string | null | undefined }) {
  if (!category) return null;
  const m = categoryMeta[category] ?? categoryMeta.other;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: m.bg, color: m.color }}>
      {m.emoji} {m.label}
    </span>
  );
}

const schema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  category: z.string().optional(),
  description: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  durationHours: z.string().optional(),
  pricePerPerson: z.string().optional(),
  minPax: z.string().optional(),
  maxPax: z.string().optional(),
});

export default function Activities() {
  const [open, setOpen] = useState(false);
  const { data: activities, isLoading } = useListActivities();
  const create = useCreateActivity();
  const remove = useDeleteActivity();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", description: "", city: "", country: "",
      durationHours: "", pricePerPerson: "", minPax: "", maxPax: "",
    },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    create.mutate({
      data: {
        name: values.name,
        ...(values.category && values.category !== "none" ? { category: values.category as ActivityInputCategory } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.city ? { city: values.city } : {}),
        ...(values.country ? { country: values.country } : {}),
        ...(values.durationHours ? { durationHours: parseFloat(values.durationHours) } : {}),
        ...(values.pricePerPerson ? { pricePerPerson: parseFloat(values.pricePerPerson) } : {}),
        ...(values.minPax ? { minPax: parseInt(values.minPax) } : {}),
        ...(values.maxPax ? { maxPax: parseInt(values.maxPax) } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/activities"] });
        toast({ title: "Actividad creada" });
        setOpen(false);
        form.reset();
      },
      onError: () => toast({ variant: "destructive", title: "Error al crear la actividad" }),
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    remove.mutate({ activityId: id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/activities"] });
        toast({ title: "Actividad eliminada" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
    });
  };

  // Group by category for a nicer display
  const grouped = (activities ?? []).reduce<Record<string, Activity[]>>((acc, a) => {
    const key = a.category ?? "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Actividades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de actividades y experiencias de la agencia</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
          style={{ background: "#C4793A", color: "#FAF2EB" }}
          onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
          onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
          <Plus className="w-4 h-4" /> Nueva actividad
        </button>
      </div>

      {/* Stats row */}
      {activities && activities.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {Object.entries(categoryMeta).map(([key, m]) => {
            const count = grouped[key]?.length ?? 0;
            if (!count) return null;
            return (
              <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium border border-border"
                style={{ background: m.bg, color: m.color }}>
                {m.emoji} {m.label} <span className="font-bold ml-0.5">{count}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando actividades…</div>
        ) : !activities?.length ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🗺️</div>
            <p className="text-sm text-muted-foreground mb-3">No hay actividades en el catálogo todavía</p>
            <button onClick={() => setOpen(true)} className="text-[13px] font-medium" style={{ color: "#C4793A" }}>
              Añade la primera actividad →
            </button>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Actividad", "Categoría", "Lugar", "Duración", "Precio/pax", "Grupo", "Estado", ""].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activities.map((a: Activity) => (
                <tr key={a.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors group">
                  <td className="px-5 py-3">
                    <span className="font-medium" style={{ color: "#2D1F0E" }}>{a.name}</span>
                    {a.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 max-w-[200px]">
                        {a.description}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <CategoryBadge category={a.category} />
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {[a.city, a.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {a.durationHours != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {a.durationHours}h
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {a.pricePerPerson != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Euro className="w-3 h-3" />
                        {Number(a.pricePerPerson).toFixed(2)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {(a.minPax != null || a.maxPax != null) ? (
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {a.minPax ?? 1}–{a.maxPax ?? "∞"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        background: a.active ? "#E4F3EC" : "#ECD5B8",
                        color: a.active ? "#2E7D5A" : "#7A5C3A",
                      }}>
                      {a.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(a.id, a.name)}
                      className="opacity-0 group-hover:opacity-100 text-[11px] text-muted-foreground hover:text-red-500 transition-opacity">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva actividad</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la actividad</FormLabel>
                  <FormControl><Input placeholder="Tour por la medina de Fez" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sin categoría</SelectItem>
                      {Object.entries(categoryMeta).map(([key, m]) => (
                        <SelectItem key={key} value={key}>{m.emoji} {m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descripción de la actividad y qué incluye…" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ciudad</FormLabel>
                    <FormControl><Input placeholder="Fez" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel>País</FormLabel>
                    <FormControl><Input placeholder="Marruecos" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="durationHours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duración (horas)</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="3" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="pricePerPerson" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio por persona (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="45.00" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="minPax" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mín. participantes</FormLabel>
                    <FormControl><Input type="number" placeholder="2" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="maxPax" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Máx. participantes</FormLabel>
                    <FormControl><Input type="number" placeholder="15" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}
                  style={{ background: "#C4793A", color: "#FAF2EB" }}>
                  {create.isPending ? "Creando…" : "Guardar actividad"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
