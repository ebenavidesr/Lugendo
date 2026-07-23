import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListItineraries, useCreateItinerary, useUpdateItinerary,
  useDeleteItinerary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Itinerary, ItineraryDifficulty } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getApiErrorMessage } from "@/lib/utils";

const diffBadge: Record<NonNullable<ItineraryDifficulty>, { bg: string; color: string; label: string }> = {
  easy:      { bg: "#E4F3EC", color: "#2E7D5A", label: "Fácil" },
  moderate:  { bg: "#FFF3D6", color: "#C47A00", label: "Moderado" },
  demanding: { bg: "#FDECEA", color: "#C0392B", label: "Exigente" },
};

function DiffBadge({ diff }: { diff: ItineraryDifficulty }) {
  if (!diff) return null;
  const s = diffBadge[diff];
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

const schema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  numDays: z.string().min(1, "Días requerido"),
  countries: z.string().optional(),
  region: z.string().optional(),
  difficulty: z.enum(["easy", "moderate", "demanding"]).optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function ItineraryForm({
  title,
  defaultValues,
  onSubmit,
  isPending,
  onCancel,
}: {
  title: string;
  defaultValues: FormValues;
  onSubmit: (v: FormValues) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: defaultValues,
  });

  return (
    <Dialog open onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl><Input placeholder="Marruecos Imperial — 8 días" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="numDays" render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de días</FormLabel>
                  <FormControl><Input type="number" placeholder="8" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="difficulty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Dificultad</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="easy">Fácil</SelectItem>
                      <SelectItem value="moderate">Moderado</SelectItem>
                      <SelectItem value="demanding">Exigente</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="countries" render={({ field }) => (
              <FormItem>
                <FormLabel>Países (separados por coma)</FormLabel>
                <FormControl><Input placeholder="Marruecos, España" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="region" render={({ field }) => (
              <FormItem>
                <FormLabel>Región (opcional)</FormLabel>
                <FormControl><Input placeholder="Norte de África" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción (opcional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Un viaje por las ciudades imperiales de Marruecos…" rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
              <Button type="submit" disabled={isPending}
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {isPending ? "Guardando…" : "Guardar itinerario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Itineraries() {
  const [, navigate] = useLocation();
  const [editItinerary, setEditItinerary] = useState<Itinerary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const { data: itineraries, isLoading } = useListItineraries();
  const update = useUpdateItinerary();
  const deleteIt = useDeleteItinerary();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager" || user?.role === "agent";

  const visibleItineraries = itineraries?.filter(it => showInactive || it.active !== false);

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteIt.mutate({ itineraryId: deleteTarget.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
        toast({ title: "Itinerario eliminado" });
        setDeleteTarget(null);
      },
      onError: (err) => toast({ variant: "destructive", title: getApiErrorMessage(err, "Error al eliminar el itinerario") }),
    });
  };

  const handleToggleActive = (it: Itinerary) => {
    update.mutate({ itineraryId: it.id, data: { active: !it.active } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
        toast({ title: it.active ? "Itinerario marcado como inactivo" : "Itinerario marcado como activo" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al cambiar el estado" }),
    });
  };

  const handleEdit = (values: FormValues) => {
    if (!editItinerary) return;
    const countries = values.countries?.trim()
      ? values.countries.split(",").map(s => s.trim()).filter(Boolean)
      : [];
    update.mutate({
      itineraryId: editItinerary.id,
      data: {
        name: values.name,
        numDays: parseInt(values.numDays),
        countries,
        ...(values.region ? { region: values.region } : {}),
        ...(values.difficulty ? { difficulty: values.difficulty } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${editItinerary.id}`] });
        toast({ title: "Itinerario actualizado" });
        setEditItinerary(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al actualizar el itinerario" }),
    });
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Itinerarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plantillas de ruta reutilizables en múltiples viajes</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
              className="w-3.5 h-3.5" />
            Mostrar inactivos
          </label>
          <button
            onClick={() => navigate("/itineraries/new")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
            style={{ background: "#C4793A", color: "#FAF2EB" }}
            onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
            onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
            <Plus className="w-4 h-4" /> Nuevo itinerario
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando itinerarios…</div>
        ) : !itineraries?.length ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No hay itinerarios todavía</p>
            <button onClick={() => navigate("/itineraries/new")} className="text-[13px] font-medium" style={{ color: "#C4793A" }}>
              Crea el primer itinerario →
            </button>
          </div>
        ) : !visibleItineraries?.length ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">Todos los itinerarios están inactivos — activa "Mostrar inactivos" para verlos</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Nombre", "Creado por", "Países", "Días", "Dificultad", "Viajes", "Estado", ""].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItineraries.map((it: Itinerary) => {
                const canDeleteThis = (it.tripCount ?? 0) === 0;
                return (
                <tr key={it.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors group">
                  <td className="px-5 py-3">
                    <span className="font-medium" style={{ color: "#2D1F0E" }}>{it.name}</span>
                    {it.region && <div className="text-[11px] text-muted-foreground mt-0.5">{it.region}</div>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{it.createdByName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {it.countries?.join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{it.numDays}d</td>
                  <td className="px-5 py-3"><DiffBadge diff={it.difficulty ?? null} /></td>
                  <td className="px-5 py-3 text-muted-foreground">{it.tripCount ?? 0}</td>
                  <td className="px-5 py-3">
                    {canManage ? (
                      <button
                        onClick={() => handleToggleActive(it)}
                        title={it.active === false ? "Haz clic para activar" : "Haz clic para desactivar"}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-opacity hover:opacity-75 cursor-pointer"
                        style={{ background: it.active === false ? "#ECD5B8" : "#E4F3EC", color: it.active === false ? "#7A5C3A" : "#2E7D5A" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: it.active === false ? "#7A5C3A" : "#2E7D5A" }} />
                        {it.active === false ? "Inactivo" : "Activo"}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: it.active === false ? "#ECD5B8" : "#E4F3EC", color: it.active === false ? "#7A5C3A" : "#2E7D5A" }}>
                        {it.active === false ? "Inactivo" : "Activo"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditItinerary(it)}
                          className="p-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canManage && (
                          <button
                            onClick={() => canDeleteThis && setDeleteTarget({ id: it.id, name: it.name })}
                            disabled={!canDeleteThis}
                            title={canDeleteThis ? undefined : `No se puede borrar: tiene ${it.tripCount} viaje(s) vinculado(s)`}
                            className="p-1 rounded-[6px] text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <Link href={`/itineraries/${it.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "#C4793A" }}>
                        Ver <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editItinerary && (
        <ItineraryForm
          title={`Editar: ${editItinerary.name}`}
          defaultValues={{
            name: editItinerary.name,
            numDays: String(editItinerary.numDays),
            countries: editItinerary.countries?.join(", ") ?? "",
            region: editItinerary.region ?? "",
            difficulty: editItinerary.difficulty ?? undefined,
            description: editItinerary.description ?? "",
          }}
          onSubmit={handleEdit}
          isPending={update.isPending}
          onCancel={() => setEditItinerary(null)}
        />
      )}

      {deleteTarget && (
        <Dialog open onOpenChange={v => !v && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Borrar itinerario</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">
              ¿Seguro que quieres borrar{" "}
              <strong className="font-medium" style={{ color: "#2D1F0E" }}>"{deleteTarget.name}"</strong>?{" "}
              Esta acción no se puede deshacer.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)}
                disabled={deleteIt.isPending}>
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={deleteIt.isPending}
                onClick={handleDelete} className="gap-1.5" style={{ background: "#C0392B", color: "white" }}>
                <Trash2 className="w-3.5 h-3.5" />
                {deleteIt.isPending ? "Eliminando…" : "Borrar itinerario"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
