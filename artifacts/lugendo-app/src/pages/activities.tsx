import { useState, useEffect } from "react";
import { Plus, Clock, Users, Euro, Pencil, Globe, Search, Trash2, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListActivities, useCreateActivity, useDeleteActivity, useUpdateActivity } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Activity, ActivityInputCategory } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useAutoDescription } from "@/hooks/use-auto-description";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { CountrySelect } from "@/components/country-select";

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
  active: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

type LookupResult = { name: string; city: string; country: string; address: string; description: string };

function ActivityForm({
  title,
  defaultValues,
  onSubmit,
  isPending,
  onCancel,
  isNew = false,
}: {
  title: string;
  defaultValues: FormValues;
  onSubmit: (v: FormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: defaultValues,
  });
  const { toast } = useToast();
  const { isLoading: descLoading, trigger: triggerDesc } = useAutoDescription("activity");

  const name = form.watch("name");
  const city = form.watch("city");

  useEffect(() => {
    if (name && city) {
      triggerDesc(`${name} ${city}`, form.getValues("description") ?? "", desc => form.setValue("description", desc, { shouldDirty: true }));
    }
  }, [name, city]);

  const [lookupQ, setLookupQ] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  const handleLookup = async () => {
    if (!lookupQ.trim()) return;
    setLookupLoading(true);
    setLookupDone(false);
    setLookupResults([]);
    try {
      const res = await fetch(`/api/activities/lookup?q=${encodeURIComponent(lookupQ)}`, { credentials: "include" });
      if (res.ok) {
        const data: LookupResult[] = await res.json();
        setLookupResults(data);
        if (data.length === 0) toast({ title: "Sin resultados", description: "Prueba con otro nombre o lugar." });
      } else {
        toast({ variant: "destructive", title: "Error al buscar" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error de conexión" });
    } finally {
      setLookupLoading(false);
      setLookupDone(true);
    }
  };

  const applyResult = (r: LookupResult) => {
    form.reset({
      name: r.name,
      city: r.city,
      country: r.country,
      description: r.description || form.getValues("description") || "",
      durationHours: form.getValues("durationHours"),
      pricePerPerson: form.getValues("pricePerPerson"),
      minPax: form.getValues("minPax"),
      maxPax: form.getValues("maxPax"),
      category: form.getValues("category"),
    });
    setLookupResults([]);
    setLookupQ("");
    setLookupDone(false);
  };

  return (
    <Dialog open onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* ── Web search (creation only) ─────────────────────────────── */}
            {isNew && (
              <div className="rounded-[10px] border border-border p-3 space-y-2" style={{ background: "#F8F6FC" }}>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>
                  <Globe className="w-3.5 h-3.5" /> Buscar en internet
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: Sagrada Família Barcelona…"
                    value={lookupQ}
                    onChange={e => setLookupQ(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleLookup())}
                    className="h-8 text-[13px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5 shrink-0"
                    style={{ background: "#3D2F6B", color: "white" }}
                    disabled={lookupLoading || !lookupQ.trim()}
                    onClick={handleLookup}
                  >
                    <Search className="w-3.5 h-3.5" />
                    {lookupLoading ? "Buscando…" : "Buscar"}
                  </Button>
                </div>

                {lookupResults.length > 0 && (
                  <div className="space-y-0.5 border border-border rounded-[8px] overflow-hidden" style={{ background: "white" }}>
                    <p className="text-[10px] text-muted-foreground px-2 pt-1.5 pb-0.5">
                      Haz clic en un resultado para rellenar el formulario
                    </p>
                    {lookupResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyResult(r)}
                        className="w-full text-left px-3 py-2 hover:bg-[#FAF2EB] transition-colors flex items-start justify-between gap-3 border-t border-border/40 first:border-t-0"
                      >
                        <div>
                          <p className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>{r.name}</p>
                          {r.description && <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[280px]">{r.description}</p>}
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{r.city}{r.country ? `, ${r.country}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}

                {lookupDone && lookupResults.length === 0 && (
                  <p className="text-[12px] text-muted-foreground text-center py-1">
                    Sin resultados — rellena el formulario manualmente
                  </p>
                )}
              </div>
            )}

            {isNew && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground">o introduce los datos manualmente</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* ── Manual form ───────────────────────────────────────────── */}
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
                <div className="flex items-center justify-between">
                  <FormLabel>Descripción (opcional)</FormLabel>
                  {descLoading && (
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: "#3D2F6B" }}>
                      <Loader2 className="w-3 h-3 animate-spin" /> Generando…
                    </span>
                  )}
                </div>
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
                  <FormControl>
                    <CountrySelect value={field.value} onChange={field.onChange} placeholder="Seleccionar país…" />
                  </FormControl>
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

            {!isNew && (
              <FormField control={form.control} name="active" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => field.onChange(!field.value)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border"
                      style={{
                        background: field.value ? "#E4F3EC" : "#ECD5B8",
                        color: field.value ? "#2E7D5A" : "#7A5C3A",
                        borderColor: field.value ? "#2E7D5A40" : "#7A5C3A40",
                      }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: field.value ? "#2E7D5A" : "#7A5C3A" }} />
                      {field.value ? "Activa" : "Inactiva"}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      Haz clic para cambiar el estado
                    </span>
                  </div>
                </FormItem>
              )} />
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
              <Button type="submit" disabled={isPending}
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {isPending ? "Guardando…" : "Guardar actividad"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Activities() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const { data: activities, isLoading } = useListActivities();
  const create = useCreateActivity();
  const update = useUpdateActivity();
  const remove = useDeleteActivity();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canDelete = user?.role === "admin";

  const grouped = (activities ?? []).reduce<Record<string, Activity[]>>((acc, a) => {
    const key = a.category ?? "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const handleCreate = (values: FormValues) => {
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
        setCreateOpen(false);
      },
      onError: () => toast({ variant: "destructive", title: "Error al crear la actividad" }),
    });
  };

  const handleEdit = (values: FormValues) => {
    if (!editActivity) return;
    update.mutate({
      activityId: editActivity.id,
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
        ...(values.active !== undefined ? { active: values.active } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/activities"] });
        toast({ title: "Actividad actualizada" });
        setEditActivity(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al actualizar" }),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    remove.mutate({ activityId: deleteTarget.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/activities"] });
        toast({ title: "Actividad eliminada" });
        setDeleteTarget(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
    });
  };

  const handleDeactivate = () => {
    if (!deleteTarget) return;
    update.mutate({ activityId: deleteTarget.id, data: { active: false } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/activities"] });
        toast({ title: "Actividad desactivada" });
        setDeleteTarget(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al desactivar" }),
    });
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Actividades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de actividades y experiencias de la agencia</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
          style={{ background: "#C4793A", color: "#FAF2EB" }}
          onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
          onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
          <Plus className="w-4 h-4" /> Nueva actividad
        </button>
      </div>

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

      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando actividades…</div>
        ) : !activities?.length ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🗺️</div>
            <p className="text-sm text-muted-foreground mb-3">No hay actividades en el catálogo todavía</p>
            <button onClick={() => setCreateOpen(true)} className="text-[13px] font-medium" style={{ color: "#C4793A" }}>
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
                    <button
                      onClick={() => update.mutate(
                        { activityId: a.id, data: { active: !a.active } },
                        { onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/activities"] }),
                          onError: () => toast({ variant: "destructive", title: "Error al cambiar estado" }) }
                      )}
                      title={a.active ? "Haz clic para desactivar" : "Haz clic para activar"}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-opacity hover:opacity-75 cursor-pointer"
                      style={{
                        background: a.active ? "#E4F3EC" : "#ECD5B8",
                        color: a.active ? "#2E7D5A" : "#7A5C3A",
                      }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.active ? "#2E7D5A" : "#7A5C3A" }} />
                      {a.active ? "Activa" : "Inactiva"}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditActivity(a)}
                        className="p-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget({ id: a.id, name: a.name })}
                          className="p-1 rounded-[6px] text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <ActivityForm
          title="Nueva actividad"
          defaultValues={{ name: "", description: "", city: "", country: "", durationHours: "", pricePerPerson: "", minPax: "", maxPax: "" }}
          onSubmit={handleCreate}
          isPending={create.isPending}
          onCancel={() => setCreateOpen(false)}
          isNew
        />
      )}

      {editActivity && (
        <ActivityForm
          title={`Editar: ${editActivity.name}`}
          defaultValues={{
            name: editActivity.name,
            category: editActivity.category ?? undefined,
            description: editActivity.description ?? "",
            city: editActivity.city ?? "",
            country: editActivity.country ?? "",
            durationHours: editActivity.durationHours != null ? String(editActivity.durationHours) : "",
            pricePerPerson: editActivity.pricePerPerson != null ? String(editActivity.pricePerPerson) : "",
            minPax: editActivity.minPax != null ? String(editActivity.minPax) : "",
            maxPax: editActivity.maxPax != null ? String(editActivity.maxPax) : "",
            active: editActivity.active,
          }}
          onSubmit={handleEdit}
          isPending={update.isPending}
          onCancel={() => setEditActivity(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          entityType="activity"
          entityId={deleteTarget.id}
          entityName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDelete={handleDelete}
          onDeactivate={handleDeactivate}
          isPendingDelete={remove.isPending}
          isPendingDeactivate={update.isPending}
        />
      )}
    </div>
  );
}
