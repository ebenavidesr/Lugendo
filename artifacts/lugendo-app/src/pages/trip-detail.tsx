import { useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Plane, Users, Calendar, Mail, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetTrip, useSendInvitations, useUpdateTrip } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { TripDetailStatus, InvitationStatus } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const statusBadge: Record<TripDetailStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#ECD5B8", color: "#7A5C3A", label: "Borrador" },
  scheduled: { bg: "#EAE6F5", color: "#3D2F6B", label: "Programado" },
  active:    { bg: "#E4F3EC", color: "#2E7D5A", label: "Activo" },
  finished:  { bg: "#E5D4BF", color: "#9C7A58", label: "Finalizado" },
  cancelled: { bg: "#FDECEA", color: "#C0392B", label: "Cancelado" },
};

const invStatusBadge: Record<InvitationStatus, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#EAE6F5", color: "#3D2F6B", label: "Pendiente" },
  accepted: { bg: "#E4F3EC", color: "#2E7D5A", label: "Aceptada" },
  declined: { bg: "#FDECEA", color: "#C0392B", label: "Rechazada" },
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

const inviteSchema = z.object({
  emails: z.string().min(1, "Introduce al menos un email"),
});

const statusSchema = z.object({
  status: z.enum(["draft", "scheduled", "active", "finished", "cancelled"]),
});

export default function TripDetail() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data: trip, isLoading } = useGetTrip(tripId);
  const sendInv = useSendInvitations();
  const updateTrip = useUpdateTrip();
  const qc = useQueryClient();
  const { toast } = useToast();

  const inviteForm = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { emails: "" },
  });

  const statusForm = useForm<z.infer<typeof statusSchema>>({
    resolver: zodResolver(statusSchema),
    values: { status: trip?.status ?? "draft" },
  });

  const onInvite = (values: z.infer<typeof inviteSchema>) => {
    const emails = values.emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
    sendInv.mutate({ tripId, data: { emails } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
        toast({ title: `${emails.length} invitación${emails.length > 1 ? "es" : ""} enviada${emails.length > 1 ? "s" : ""}` });
        setInviteOpen(false);
        inviteForm.reset();
      },
      onError: () => toast({ variant: "destructive", title: "Error al enviar invitaciones" }),
    });
  };

  const onStatusChange = (status: TripDetailStatus) => {
    updateTrip.mutate({ tripId, data: { status } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
        qc.invalidateQueries({ queryKey: ["/api/trips"] });
        toast({ title: "Estado actualizado" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al actualizar estado" }),
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-40 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-6">
        <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Volver a viajes
        </Link>
        <p className="text-muted-foreground">Viaje no encontrado</p>
      </div>
    );
  }

  const s = statusBadge[trip.status] ?? statusBadge.draft;
  const accepted = trip.invitations?.filter(i => i.status === "accepted").length ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/trips" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground mb-2 hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Todos los viajes
          </Link>
          <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>{trip.name}</h1>
          {trip.itineraryName && (
            <p className="text-sm text-muted-foreground mt-0.5">Itinerario: {trip.itineraryName}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium"
            style={{ background: s.bg, color: s.color }}>{s.label}</span>
          <Select value={trip.status} onValueChange={v => onStatusChange(v as TripDetailStatus)}>
            <SelectTrigger className="h-8 text-[12px] w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="scheduled">Programado</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="finished">Finalizado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Inicio</span>
          </div>
          <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>{fmt(trip.startDate)}</p>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Fin</span>
          </div>
          <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>
            {trip.endDate ? fmt(trip.endDate) : "—"}
          </p>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Viajeros</span>
          </div>
          <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>
            {accepted}{trip.maxCapacity ? `/${trip.maxCapacity}` : ""}
          </p>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Plane className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Vuelo</span>
          </div>
          <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>
            {trip.flightNumber ?? "—"}
          </p>
          {trip.airline && <p className="text-[11px] text-muted-foreground">{trip.airline}</p>}
        </div>
      </div>

      {/* Flight details */}
      {(trip.reservationCode || trip.flightTime || trip.flightNotes) && (
        <div className="bg-card border border-border rounded-[14px] p-5">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Info de vuelo</p>
          <div className="grid grid-cols-3 gap-4 text-[13px]">
            {trip.reservationCode && (
              <div>
                <p className="text-muted-foreground text-[11px] mb-0.5">Código reserva</p>
                <p className="font-medium font-mono" style={{ color: "#2D1F0E" }}>{trip.reservationCode}</p>
              </div>
            )}
            {trip.flightTime && (
              <div>
                <p className="text-muted-foreground text-[11px] mb-0.5">Hora vuelo</p>
                <p className="font-medium" style={{ color: "#2D1F0E" }}>{trip.flightTime}</p>
              </div>
            )}
          </div>
          {trip.flightNotes && (
            <p className="text-[13px] text-muted-foreground mt-3 p-3 rounded-[8px]"
              style={{ background: "#FAF2EB" }}>{trip.flightNotes}</p>
          )}
        </div>
      )}

      {/* Days */}
      {trip.days && trip.days.length > 0 && (
        <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
              Días del itinerario ({trip.days.length})
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {trip.days.map(day => (
              <li key={day.id} className="px-5 py-3 flex items-start gap-4">
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 text-[13px] font-medium"
                  style={{ background: "#FAEEE4", color: "#C4793A" }}>
                  {day.dayNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
                    {day.cityFrom && day.cityTo
                      ? `${day.cityFrom} → ${day.cityTo}`
                      : day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                  </p>
                  {day.hotelName && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">🏨 {day.hotelName}</p>
                  )}
                  {day.transport && (
                    <p className="text-[12px] text-muted-foreground">✈️ {day.transport}</p>
                  )}
                  {day.description && (
                    <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{day.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invitations */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
            Viajeros invitados ({trip.invitations?.length ?? 0})
          </span>
          <button onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium"
            style={{ background: "#C4793A", color: "#FAF2EB" }}>
            <Plus className="w-3.5 h-3.5" /> Invitar
          </button>
        </div>
        {!trip.invitations?.length ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No hay viajeros invitados todavía
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Email", "Viajero", "Código", "Estado", "Aceptado"].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trip.invitations.map(inv => {
                const is = invStatusBadge[inv.status] ?? invStatusBadge.pending;
                return (
                  <tr key={inv.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20">
                    <td className="px-5 py-3 text-muted-foreground">{inv.email}</td>
                    <td className="px-5 py-3" style={{ color: "#2D1F0E" }}>{inv.travelerName ?? "—"}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-muted-foreground">{inv.inviteCode}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: is.bg, color: is.color }}>{is.label}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {inv.acceptedAt ? fmt(inv.acceptedAt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invitar viajeros</DialogTitle>
          </DialogHeader>
          <Form {...inviteForm}>
            <form onSubmit={inviteForm.handleSubmit(onInvite)} className="space-y-4">
              <FormField control={inviteForm.control} name="emails" render={({ field }) => (
                <FormItem>
                  <FormLabel>Emails de los viajeros</FormLabel>
                  <FormControl>
                    <Textarea placeholder={"ana@ejemplo.com\ncarlo@ejemplo.com"} rows={5} {...field} />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground">Un email por línea o separados por coma</p>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={sendInv.isPending}
                  style={{ background: "#C4793A", color: "#FAF2EB" }}>
                  {sendInv.isPending ? "Enviando…" : "Enviar invitaciones"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
