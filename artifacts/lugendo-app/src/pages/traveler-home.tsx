import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListMyTrips, useCreateMyTrip } from "@workspace/api-client-react";
import type { TravelerTrip, TravelerTripStatus } from "@workspace/api-client-react";
import { MapPin, ArrowRight, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const statusBadge: Record<TravelerTripStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#ECD5B8", color: "#7A5C3A", label: "Próximamente" },
  scheduled: { bg: "#EAE6F5", color: "#3D2F6B", label: "Programado" },
  active:    { bg: "#E4F3EC", color: "#2E7D5A", label: "En curso" },
  finished:  { bg: "#E5D4BF", color: "#9C7A58", label: "Finalizado" },
  cancelled: { bg: "#FDECEA", color: "#C0392B", label: "Cancelado" },
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

const tripGradients = [
  "linear-gradient(135deg, #3D2F6B 0%, #5B4A9B 100%)",
  "linear-gradient(135deg, #8B4420 0%, #C4793A 100%)",
  "linear-gradient(135deg, #2E4A5A 0%, #4A7B8B 100%)",
  "linear-gradient(135deg, #2D4A2D 0%, #3D7B5A 100%)",
  "linear-gradient(135deg, #4A2D3D 0%, #8B4A6B 100%)",
];

const newTripSchema = z.object({
  name:      z.string().min(2, "El nombre es obligatorio"),
  startDate: z.string().min(1, "La fecha de inicio es obligatoria"),
  endDate:   z.string().optional(),
});

function NewTripDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTrip = useCreateMyTrip();

  const form = useForm<z.infer<typeof newTripSchema>>({
    resolver: zodResolver(newTripSchema),
    defaultValues: { name: "", startDate: "", endDate: "" },
  });

  const onSubmit = (values: z.infer<typeof newTripSchema>) => {
    createTrip.mutate(
      { data: { name: values.name, startDate: values.startDate, endDate: values.endDate || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/me/trips"] });
          toast({ title: "Viaje creado", description: `"${values.name}" añadido a tus viajes.` });
          form.reset();
          onClose();
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "No se pudo crear el viaje." });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">Nuevo viaje</DialogTitle>
          <DialogDescription>Crea un viaje personal para organizar tus aventuras.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del viaje</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Ruta por Japón" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de inicio</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de fin <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={createTrip.isPending}>
                {createTrip.isPending ? "Creando…" : "Crear viaje"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function TravelerHome() {
  const { data: trips, isLoading } = useListMyTrips();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-[16px] h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  const hasTrips = trips && trips.length > 0;

  return (
    <>
      <NewTripDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>Mis viajes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Tu pasaporte de aventuras</p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            size="sm"
            className="shrink-0"
            style={{ background: "var(--terra)", color: "#fff" }}
            data-testid="button-new-trip"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo viaje
          </Button>
        </div>

        {/* Empty state */}
        {!hasTrips && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: "#FAEEE4" }}
            >
              <MapPin className="w-7 h-7" style={{ color: "#C4793A" }} />
            </div>
            <h2 className="text-xl font-medium mb-2" style={{ color: "#2D1F0E" }}>Todavía no tienes viajes</h2>
            <p className="text-sm text-muted-foreground max-w-xs mb-5">
              Crea tu propio viaje o únete a uno de agencia con el código de invitación que recibirás por email.
            </p>
            <Button onClick={() => setDialogOpen(true)} style={{ background: "var(--terra)", color: "#fff" }}>
              <Plus className="w-4 h-4 mr-1.5" />
              Crear mi primer viaje
            </Button>
          </div>
        )}

        {/* Trip list */}
        {trips?.map((trip: TravelerTrip, idx) => {
          const s = statusBadge[trip.status] ?? statusBadge.draft;
          const gradient = tripGradients[idx % tripGradients.length];

          return (
            <Link key={trip.id} href={`/traveler/trips/${trip.id}`}>
              <div className="bg-card border border-border rounded-[16px] overflow-hidden shadow-sm cursor-pointer transition-shadow hover:shadow-md">
                {/* Header band */}
                <div
                  className="h-20 relative flex items-end px-5 pb-3"
                  style={{ background: gradient }}
                >
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)" }} />
                  <div className="relative z-10 flex items-end justify-between w-full">
                    <div>
                      {trip.countries && trip.countries.length > 0 && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <MapPin className="w-3 h-3 text-white/70" />
                          <span className="text-[11px] font-medium text-white/70 uppercase tracking-wider">
                            {trip.countries.join(" · ")}
                          </span>
                        </div>
                      )}
                      <h3 className="text-[18px] font-medium text-white leading-tight">{trip.name}</h3>
                    </div>
                    {trip.isPersonal && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: "rgba(255,255,255,0.2)", color: "#fff", backdropFilter: "blur(4px)" }}>
                        Propio
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-muted-foreground">
                      {fmt(trip.startDate)}
                      {trip.endDate ? ` — ${fmt(trip.endDate)}` : ""}
                    </p>
                    {trip.agencyName && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">{trip.agencyName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium"
                      style={{ background: s.bg, color: s.color }}
                    >
                      {s.label}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
