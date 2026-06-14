import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListTrips, useUpdateTrip, useDeleteTrip, useListItineraries } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Trip, TripStatus } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

const statusBadge: Record<TripStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#ECD5B8", color: "#7A5C3A", label: "Borrador" },
  scheduled: { bg: "#EAE6F5", color: "#3D2F6B", label: "Programado" },
  active:    { bg: "#E4F3EC", color: "#2E7D5A", label: "Activo" },
  finished:  { bg: "#E5D4BF", color: "#9C7A58", label: "Finalizado" },
  cancelled: { bg: "#FDECEA", color: "#C0392B", label: "Cancelado" },
};

function StatusBadge({ status }: { status: TripStatus }) {
  const s = statusBadge[status] ?? statusBadge.draft;
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

const editSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  status: z.enum(["draft", "scheduled", "active", "finished", "cancelled"]),
  itineraryId: z.string().optional(),
  startDate: z.string().min(1, "Fecha de inicio requerida"),
  endDate: z.string().optional(),
  maxCapacity: z.string().optional(),
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  reservationCode: z.string().optional(),
});

function EditTripDialog({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const update = useUpdateTrip();
  const { data: itineraries } = useListItineraries();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    values: {
      name: trip.name,
      status: trip.status,
      itineraryId: trip.itineraryId ? String(trip.itineraryId) : "none",
      startDate: trip.startDate.slice(0, 10),
      endDate: trip.endDate ? trip.endDate.slice(0, 10) : "",
      maxCapacity: trip.maxCapacity ? String(trip.maxCapacity) : "",
      airline: trip.airline ?? "",
      flightNumber: trip.flightNumber ?? "",
      reservationCode: trip.reservationCode ?? "",
    },
  });

  const onSubmit = (values: z.infer<typeof editSchema>) => {
    update.mutate({
      tripId: trip.id,
      data: {
        name: values.name,
        status: values.status,
        startDate: values.startDate,
        ...(values.endDate ? { endDate: values.endDate } : {}),
        ...(values.itineraryId && values.itineraryId !== "none" ? { itineraryId: parseInt(values.itineraryId) } : {}),
        ...(values.maxCapacity ? { maxCapacity: parseInt(values.maxCapacity) } : {}),
        ...(values.airline ? { airline: values.airline } : {}),
        ...(values.flightNumber ? { flightNumber: values.flightNumber } : {}),
        ...(values.reservationCode ? { reservationCode: values.reservationCode } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/trips"] });
        qc.invalidateQueries({ queryKey: [`/api/trips/${trip.id}`] });
        toast({ title: "Viaje actualizado" });
        onClose();
      },
      onError: () => toast({ variant: "destructive", title: "Error al actualizar el viaje" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar viaje</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del viaje</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Borrador</SelectItem>
                      <SelectItem value="scheduled">Programado</SelectItem>
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="finished">Finalizado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="maxCapacity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacidad máx.</FormLabel>
                  <FormControl><Input type="number" placeholder="20" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="itineraryId" render={({ field }) => (
              <FormItem>
                <FormLabel>Itinerario</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Seleccionar itinerario" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Sin itinerario</SelectItem>
                    {itineraries?.map(it => (
                      <SelectItem key={it.id} value={String(it.id)}>{it.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de inicio</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de fin</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="airline" render={({ field }) => (
                <FormItem>
                  <FormLabel>Aerolínea</FormLabel>
                  <FormControl><Input placeholder="Iberia" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="flightNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº vuelo</FormLabel>
                  <FormControl><Input placeholder="IB1234" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="reservationCode" render={({ field }) => (
              <FormItem>
                <FormLabel>Código reserva</FormLabel>
                <FormControl><Input placeholder="ABCDEF" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={update.isPending}
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {update.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Trips() {
  const [, navigate] = useLocation();
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const { data: trips, isLoading } = useListTrips();
  const remove = useDeleteTrip();
  const update = useUpdateTrip();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canDelete = user?.role === "admin" || user?.role === "manager";

  const handleDelete = () => {
    if (!deleteTarget) return;
    remove.mutate({ tripId: deleteTarget.id }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: ["/api/trips"] });
        toast({ title: result.cancelled ? "Viaje cancelado" : "Viaje eliminado" });
        setDeleteTarget(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar el viaje" }),
    });
  };

  const handleDeactivateTrip = () => {
    if (!deleteTarget) return;
    remove.mutate({ tripId: deleteTarget.id }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: ["/api/trips"] });
        toast({ title: result.cancelled ? "Viaje cancelado" : "Viaje eliminado" });
        setDeleteTarget(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al cancelar el viaje" }),
    });
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Viajes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona todos los viajes de la agencia</p>
        </div>
        <button onClick={() => navigate("/trips/new")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
          style={{ background: "#C4793A", color: "#FAF2EB" }}
          onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
          onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
          <Plus className="w-4 h-4" /> Nuevo viaje
        </button>
      </div>

      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando viajes…</div>
        ) : !trips?.length ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No hay viajes todavía</p>
            <button onClick={() => navigate("/trips/new")} className="text-[13px] font-medium" style={{ color: "#C4793A" }}>
              Crea el primer viaje →
            </button>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Nombre", ...(user?.role === "admin" ? ["Agencia"] : []), "Itinerario", "Inicio", "Estado", "Viajeros", ""].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trips.map((trip: Trip) => (
                <tr key={trip.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors group">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: "#2D1F0E" }}>{trip.name}</span>
                      {trip.ownerId && !trip.agencyId && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: "#EAE6F5", color: "#3D2F6B" }}>
                          Personal
                        </span>
                      )}
                    </div>
                  </td>
                  {user?.role === "admin" && (
                    <td className="px-5 py-3">
                      {trip.agencyName
                        ? <span className="text-[12px]" style={{ color: "#2D1F0E" }}>{trip.agencyName}</span>
                        : <span className="text-muted-foreground text-[12px]">—</span>}
                    </td>
                  )}
                  <td className="px-5 py-3 text-muted-foreground">{trip.itineraryName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{fmt(trip.startDate)}</td>
                  <td className="px-5 py-3"><StatusBadge status={trip.status} /></td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {trip.acceptedCount ?? 0}{trip.maxCapacity ? `/${trip.maxCapacity}` : ""}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditTrip(trip)}
                          className="p-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteTarget({ id: trip.id, name: trip.name })}
                            className="p-1 rounded-[6px] text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <Link href={`/trips/${trip.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "#C4793A" }}>
                        Ver <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editTrip && (
        <EditTripDialog trip={editTrip} open={!!editTrip} onClose={() => setEditTrip(null)} />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          entityType="trip"
          entityId={deleteTarget.id}
          entityName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDelete={handleDelete}
          onDeactivate={handleDeactivateTrip}
          isPendingDelete={remove.isPending}
          isPendingDeactivate={update.isPending}
        />
      )}
    </div>
  );
}
