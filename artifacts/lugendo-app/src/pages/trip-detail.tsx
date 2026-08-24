import { useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Users, Calendar, Mail, Plus, Hotel } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetTrip, useSendInvitations, useUpdateTrip, useListItineraryDays,
  useGetTripTravelAdvisories,
} from "@workspace/api-client-react";
import type { TripDetailStatus, InvitationStatus } from "@workspace/api-client-react";
import { DayListPanel } from "@/components/day-list-panel";
import { DayHotelPanel } from "@/components/day-hotel-panel";
import { AgencyTripDocuments } from "@/components/agency-trip-documents";
import { AgencyTripNotes } from "@/components/agency-trip-notes";
import { TripSafetyAdvisories } from "@/components/trip-safety-advisories";
import { AgencyTravelerTagsBadge } from "@/components/agency-traveler-tags-badge";
import { InlineField } from "@/components/inline-field";
import { FlightEditPanel } from "@/components/flight-edit-panel";
import type { FlightLeg } from "@/components/flight-edit-panel";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const invStatusBadge: Record<InvitationStatus, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#EAE6F5", color: "#3D2F6B", label: "Pendiente" },
  accepted: { bg: "#E4F3EC", color: "#2E7D5A", label: "Aceptada" },
  rejected: { bg: "#FDECEA", color: "#C0392B", label: "Rechazada" },
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

const emailLine = z.string().email("Formato de email inválido");

const inviteSchema = z.object({
  emails: z.string().min(1, "Introduce al menos un email"),
}).superRefine((val, ctx) => {
  const lines = val.emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
  if (lines.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Introduce al menos un email", path: ["emails"] });
    return;
  }
  const invalid = lines.filter(e => emailLine.safeParse(e).success === false);
  if (invalid.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Email${invalid.length > 1 ? "s" : ""} no válido${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`, path: ["emails"] });
  }
});

function toApiLeg(l: FlightLeg) {
  return {
    airline: l.airline || undefined,
    flightNumber: l.flightNumber || undefined,
    cityFrom: l.cityFrom || undefined,
    cityTo: l.cityTo || undefined,
    date: l.date || undefined,
    departureTime: l.departureTime || undefined,
    arrivalTime: l.arrivalTime || undefined,
    reservationCode: l.reservationCode || undefined,
  };
}

function fromApiLeg(l: { airline?: string; flightNumber?: string; cityFrom?: string; cityTo?: string; date?: string; departureTime?: string; arrivalTime?: string; reservationCode?: string; } | null | undefined): FlightLeg {
  return {
    airline: l?.airline ?? "",
    flightNumber: l?.flightNumber ?? "",
    cityFrom: l?.cityFrom ?? "",
    cityTo: l?.cityTo ?? "",
    date: l?.date ?? "",
    departureTime: l?.departureTime ?? "",
    arrivalTime: l?.arrivalTime ?? "",
    reservationCode: l?.reservationCode ?? "",
  };
}

function formatDayDate(startDate: string | null | undefined, dayNumber: number): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + dayNumber - 1);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

export default function TripDetail() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hotelBulkOpen, setHotelBulkOpen] = useState(false);
  const { data: trip, isLoading } = useGetTrip(tripId);
  const { data: itineraryDays } = useListItineraryDays(trip?.itineraryId ?? 0);
  const { data: advisories, isLoading: isLoadingAdvisories } = useGetTripTravelAdvisories(tripId);

  const itineraryDayMap = Object.fromEntries(
    (itineraryDays ?? []).map(d => [d.dayNumber, d])
  );

  const sendInv = useSendInvitations();
  const updateTrip = useUpdateTrip();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditDocuments = user?.role === "admin" || user?.role === "manager" || user?.role === "agent" || user?.role === "advisor";

  const inviteForm = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { emails: "" },
  });

  const onInvite = (values: z.infer<typeof inviteSchema>) => {
    const emails = values.emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
    sendInv.mutate({ tripId, data: { invitees: emails.map(email => ({ email })) } }, {
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

  const saveField = async (patch: Record<string, unknown>) => {
    await updateTrip.mutateAsync({ tripId, data: patch as Parameters<typeof updateTrip.mutateAsync>[0]["data"] });
    await qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
    await qc.invalidateQueries({ queryKey: ["/api/trips"] });
  };

  const handleSaveFlights = async (data: { outboundFlights: FlightLeg[]; returnFlights: FlightLeg[] }) => {
    await updateTrip.mutateAsync({
      tripId,
      data: {
        outboundFlights: data.outboundFlights.map(toApiLeg),
        returnFlights: data.returnFlights.map(toApiLeg),
      },
    });
    await qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
    toast({ title: "Vuelos guardados" });
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

  const accepted = trip.invitations?.filter(i => i.status === "accepted").length ?? 0;

  const outboundFlights: FlightLeg[] = trip.outboundFlights && trip.outboundFlights.length > 0
    ? trip.outboundFlights.map(fromApiLeg)
    : (trip.airline || trip.flightNumber)
      ? [fromApiLeg({ airline: trip.airline ?? "", flightNumber: trip.flightNumber ?? "", departureTime: trip.flightTime ?? "", reservationCode: trip.reservationCode ?? "" })]
      : [];

  const returnFlights: FlightLeg[] = trip.returnFlights && trip.returnFlights.length > 0
    ? trip.returnFlights.map(fromApiLeg)
    : [];

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <Link href="/trips" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground mb-2 hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Todos los viajes
          </Link>
          <InlineField
            value={trip.name}
            onSave={v => saveField({ name: v })}
            displayClassName="text-2xl font-medium"
            inputClassName="text-xl font-medium"
            className="mb-0.5"
          />
          {trip.itineraryName && (
            <p className="text-sm text-muted-foreground mt-0.5">Itinerario: {trip.itineraryName}</p>
          )}
          <InlineField
            value={trip.description ?? ""}
            onSave={v => saveField({ description: v || null })}
            type="textarea"
            emptyPlaceholder="Añadir descripción…"
            displayClassName="text-sm text-muted-foreground mt-1 max-w-xl"
            className="mt-1"
            rows={3}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
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

      {/* Info cards — with inline editing for dates and capacity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Inicio</span>
          </div>
          <InlineField
            value={trip.startDate}
            onSave={v => saveField({ startDate: v })}
            type="date"
            displayClassName="text-[14px] font-medium"
          />
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Fin</span>
          </div>
          <InlineField
            value={trip.endDate ?? ""}
            onSave={v => saveField({ endDate: v || null })}
            type="date"
            emptyPlaceholder="Sin fecha"
            displayClassName="text-[14px] font-medium"
          />
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Viajeros / Cap.</span>
          </div>
          <div className="flex items-center gap-1">
            <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>{accepted}</p>
            <span className="text-muted-foreground text-[13px]">/</span>
            <InlineField
              value={trip.maxCapacity != null ? String(trip.maxCapacity) : ""}
              onSave={v => saveField({ maxCapacity: v ? parseInt(v, 10) : null })}
              type="number"
              emptyPlaceholder="∞"
              displayClassName="text-[14px] font-medium"
              inputClassName="w-16"
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Mail className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-medium">Invitados</span>
          </div>
          <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>
            {trip.invitations?.length ?? 0}
          </p>
        </div>
      </div>

      {/* Flight panel */}
      <FlightEditPanel
        outboundFlights={outboundFlights}
        returnFlights={returnFlights}
        onSave={handleSaveFlights}
      />

      {/* Days */}
      {trip.days && (
        <DayListPanel
          mode="trip"
          entityId={tripId}
          days={trip.days}
          startDate={trip.startDate}
          headerLabel={`Días del itinerario (${trip.days.length})`}
          emptyMessage='No hay días en este itinerario. Haz clic en "Añadir día" para empezar.'
          extraHeaderActions={trip.days.length > 0 && (
            <button
              onClick={() => setHotelBulkOpen(o => !o)}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
              style={{ background: hotelBulkOpen ? "#ECD5B8" : "#FAF2EB", color: "#8B4420" }}
            >
              <Hotel className="w-3 h-3" />
              Hoteles
            </button>
          )}
          belowHeaderContent={hotelBulkOpen && trip.days.length > 0 && (
            <div className="bg-card border border-border rounded-[14px] shadow-sm px-5 py-4 animate-in fade-in slide-in-from-top-2 duration-200" style={{ background: "#FEFAF7" }}>
              <p className="text-[11px] font-medium uppercase tracking-wide mb-3" style={{ color: "#9C7A58" }}>
                Gestión de hoteles por día
              </p>
              <div className="space-y-2.5">
                {trip.days.map(day => {
                  const dateStr = formatDayDate(trip.startDate, day.dayNumber);
                  return (
                    <div key={day.id} className="rounded-[10px] border border-border/80 p-3 bg-card">
                      <p className="text-[12px] font-medium mb-1" style={{ color: "#2D1F0E" }}>
                        Día {day.dayNumber}
                        {dateStr && <span className="font-normal text-muted-foreground ml-1">· {dateStr}</span>}
                        {(day.cityFrom || day.cityTo) && (
                          <span className="font-normal text-muted-foreground ml-1">
                            {day.cityFrom && day.cityTo ? `· ${day.cityFrom} → ${day.cityTo}` : `· ${day.cityTo ?? day.cityFrom}`}
                          </span>
                        )}
                      </p>
                      <DayHotelPanel
                        entityType="trip"
                        entityId={tripId}
                        day={day}
                        allDays={trip.days}
                        invalidateKey={`/api/trips/${tripId}`}
                        compact
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        />
      )}

      {/* Viaja Seguro (sólo lectura) */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Viaja Seguro</span>
        </div>
        <div className="p-4">
          <TripSafetyAdvisories data={advisories} isLoading={isLoadingAdvisories} />
        </div>
      </div>

      {/* Documents */}
      <AgencyTripDocuments tripId={tripId} readOnly={!canEditDocuments} />

      {/* Notes (#153) */}
      <AgencyTripNotes tripId={tripId} days={trip.days ?? []} readOnly={!canEditDocuments} />

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
                {["Email", "Viajero", "Estado", "Aceptado", "Etiquetas"].map(h => (
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
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: is.bg, color: is.color }}>{is.label}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {inv.acceptedAt ? fmt(inv.acceptedAt) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {inv.status === "accepted" && inv.travelerId ? (
                        <AgencyTravelerTagsBadge travelerId={inv.travelerId} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
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
