import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import {
  ArrowLeft, Users, Calendar, Mail, Plus, ChevronDown, ChevronRight, Trash2, Loader2, Hotel,
  LayoutList, List,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetTrip, useSendInvitations, useUpdateTrip, useListItineraryDays,
  useUpdateTripDayAdmin, useCreateTripDayAdmin, useDeleteTripDayAdmin,
  useListTripDayActivities, useGetTripTravelAdvisories,
  COUNTRIES,
} from "@workspace/api-client-react";
import type { TripDetailStatus, InvitationStatus, TransportMode, DayHotel } from "@workspace/api-client-react";
import { DayActivitiesPanel } from "@/components/day-activities-panel";
import { DayHotelPanel, TransitNightBadge, getNightLabel, NightLabelBadge } from "@/components/day-hotel-panel";
import { AgencyTripDocuments } from "@/components/agency-trip-documents";
import { TripSafetyAdvisories } from "@/components/trip-safety-advisories";
import { InlineField } from "@/components/inline-field";
import { FlightEditPanel } from "@/components/flight-edit-panel";
import type { FlightLeg } from "@/components/flight-edit-panel";
import { TRANSPORT_OPTIONS } from "@/components/transport-select";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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

interface DayEditFormProps {
  day: { id: number; dayNumber: number; cityFrom?: string | null; cityTo?: string | null; cityFromCountry?: string | null; cityToCountry?: string | null; transport?: string | null; description?: string | null; isTransitNight?: boolean | null; hotels?: DayHotel[] | null; };
  tripId: number;
  allDays?: { id: number; dayNumber?: number | null; cityFrom?: string | null; cityTo?: string | null; cityFromCountry?: string | null; cityToCountry?: string | null; isTransitNight?: boolean | null; hotels?: DayHotel[] | null; }[];
  onDone: () => void;
}

function DayEditForm({ day, tripId, allDays, onDone }: DayEditFormProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateDay = useUpdateTripDayAdmin();
  const deleteDay = useDeleteTripDayAdmin();
  const [cityFrom, setCityFrom] = useState(day.cityFrom ?? "");
  const [cityTo, setCityTo] = useState(day.cityTo ?? "");
  const [cityFromCountry, setCityFromCountry] = useState(day.cityFromCountry ?? "");
  const [cityToCountry, setCityToCountry] = useState(day.cityToCountry ?? "");
  const [transport, setTransport] = useState(day.transport ?? "");
  const [description, setDescription] = useState(day.description ?? "");

  const handleSave = () => {
    updateDay.mutate(
      {
        tripId,
        dayId: day.id,
        data: {
          cityFrom: cityFrom.trim() || null,
          cityTo: cityTo.trim() || null,
          cityFromCountry: cityFromCountry || null,
          cityToCountry: cityToCountry || null,
          transport: (transport || null) as TransportMode | null,
          description: description.trim() || null,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
          toast({ title: "Día actualizado" });
          onDone();
        },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar el día" }),
      }
    );
  };

  const handleDelete = () => {
    if (!confirm("¿Eliminar este día del itinerario?")) return;
    deleteDay.mutate(
      { tripId, dayId: day.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
          toast({ title: "Día eliminado" });
          onDone();
        },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar el día" }),
      }
    );
  };

  return (
    <div className="border-t border-border/60 px-3 py-3 space-y-2.5" style={{ background: "#FAF8FC" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Editar día</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Ciudad origen</label>
          <input
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B]"
            placeholder="Madrid"
            value={cityFrom}
            onChange={e => setCityFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Ciudad destino</label>
          <input
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B]"
            placeholder="Tokio"
            value={cityTo}
            onChange={e => setCityTo(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">País origen</label>
          <select
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] bg-white"
            value={cityFromCountry}
            onChange={e => setCityFromCountry(e.target.value)}
          >
            <option value="">— País —</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">País destino</label>
          <select
            className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] bg-white"
            value={cityToCountry}
            onChange={e => setCityToCountry(e.target.value)}
          >
            <option value="">— País —</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">Transporte</label>
        <select
          className="w-full h-7 px-2 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] bg-white"
          value={transport}
          onChange={e => setTransport(e.target.value)}
        >
          <option value="">— Transporte —</option>
          {TRANSPORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">Descripción</label>
        <textarea
          className="w-full px-2 py-1.5 text-[12px] border border-border rounded-[6px] outline-none focus:ring-1 focus:ring-[#3D2F6B] resize-none"
          rows={2}
          placeholder="Notas sobre este día…"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div className="rounded-[8px] border border-border/60 bg-card px-3 py-2.5">
        <DayHotelPanel
          entityType="trip"
          entityId={tripId}
          day={day}
          allDays={allDays}
          invalidateKey={`/api/trips/${tripId}`}
          compact
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={updateDay.isPending}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium disabled:opacity-50"
          style={{ background: "#3D2F6B", color: "#FAF2EB" }}
        >
          {updateDay.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {updateDay.isPending ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteDay.isPending}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
          Eliminar día
        </button>
        <button
          onClick={onDone}
          className="h-7 px-3 rounded-[6px] text-[12px] text-muted-foreground hover:bg-muted/40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function CompactDayRow({
  day,
  startDate,
  onClick,
  tripId,
}: {
  day: any;
  startDate?: string | null;
  onClick: () => void;
  tripId: number;
}) {
  const dateStr = formatDayDate(startDate, day.dayNumber);
  const { data: dayActivities } = useListTripDayActivities(tripId, day.id);
  const hotelNames = (day.hotels ?? []).map((h: any) => h.hotelName).join(", ");

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors text-left border-b border-border/40 last:border-0"
    >
      <div className="flex flex-col items-center justify-center min-w-[48px] h-10 rounded-lg bg-muted/40 border border-border/50">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase leading-none mb-0.5">Día</span>
        <span className="text-[16px] font-bold leading-none" style={{ color: "#3D2F6B" }}>{day.dayNumber}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-semibold text-foreground truncate">
            {day.cityFrom && day.cityTo ? `${day.cityFrom} → ${day.cityTo}` : (day.cityTo ?? day.cityFrom ?? "Sin destino")}
          </span>
          {dateStr && <span className="text-[11px] text-muted-foreground">· {dateStr}</span>}
        </div>
        <div className="flex items-center gap-3">
          {day.isTransitNight ? (
            <TransitNightBadge />
          ) : hotelNames ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
              <Hotel className="w-3 h-3 shrink-0" />
              <span className="truncate">{hotelNames}</span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground/60 italic">Sin hotel</span>
          )}
          <span className="text-[11px] text-muted-foreground/60">·</span>
          <span className="text-[11px] text-muted-foreground">
            {dayActivities?.length ?? 0} {dayActivities?.length === 1 ? "actividad" : "actividades"}
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </button>
  );
}

export default function TripDetail() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"detail" | "summary">("detail");
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [editingDayId, setEditingDayId] = useState<number | null>(null);
  const [hotelBulkOpen, setHotelBulkOpen] = useState(false);
  const { data: trip, isLoading } = useGetTrip(tripId);
  const { data: itineraryDays } = useListItineraryDays(trip?.itineraryId ?? 0);
  const { data: advisories, isLoading: isLoadingAdvisories } = useGetTripTravelAdvisories(tripId);

  useEffect(() => {
    if (trip?.days && trip.days.length > 0) {
      setExpandedDays(prev => (prev.size > 0 ? prev : new Set([trip.days[0].id])));
    }
  }, [trip?.id]);

  const itineraryDayMap = Object.fromEntries(
    (itineraryDays ?? []).map(d => [d.dayNumber, d])
  );

  const toggleDay = (dayId: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  const sendInv = useSendInvitations();
  const updateTrip = useUpdateTrip();
  const createTripDay = useCreateTripDayAdmin();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditDocuments = user?.role === "admin" || user?.role === "manager" || user?.role === "agent";

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

  const handleAddDay = () => {
    const days = trip?.days ?? [];
    const nextNum = days.length > 0 ? Math.max(...days.map(d => d.dayNumber)) + 1 : 1;
    createTripDay.mutate(
      { tripId, data: { dayNumber: nextNum, cityFrom: null, cityTo: null, cityFromCountry: null, cityToCountry: null, transport: null, description: null } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
          toast({ title: `Día ${nextNum} añadido` });
        },
        onError: () => toast({ variant: "destructive", title: "Error al añadir el día" }),
      }
    );
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
        <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
              Días del itinerario ({trip.days.length})
            </span>
            <div className="flex items-center gap-3">
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => v && setViewMode(v as "detail" | "summary")}
                className="bg-muted/40 p-0.5 rounded-lg border border-border/50"
              >
                <ToggleGroupItem
                  value="detail"
                  className="h-7 px-2.5 text-[11px] font-medium data-[state=on]:bg-white data-[state=on]:shadow-sm rounded-md"
                >
                  <LayoutList className="w-3 h-3 mr-1.5" />
                  Detalle
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="summary"
                  className="h-7 px-2.5 text-[11px] font-medium data-[state=on]:bg-white data-[state=on]:shadow-sm rounded-md"
                >
                  <List className="w-3 h-3 mr-1.5" />
                  Resumen
                </ToggleGroupItem>
              </ToggleGroup>

              <div className="h-4 w-px bg-border/60 mx-1" />

              <button
                onClick={handleAddDay}
                disabled={createTripDay.isPending}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                style={{ background: "#EAE6F5", color: "#3D2F6B" }}
              >
                {createTripDay.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Plus className="w-3 h-3" />}
                Añadir día
              </button>
              {trip.days.length > 0 && (
                <>
                  <button
                    onClick={() => setHotelBulkOpen(o => !o)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                    style={{ background: hotelBulkOpen ? "#ECD5B8" : "#FAF2EB", color: "#8B4420" }}
                  >
                    <Hotel className="w-3 h-3" />
                    Hoteles
                  </button>
                  <button
                    onClick={() => {
                      if (expandedDays.size > 0) setExpandedDays(new Set());
                      else setExpandedDays(new Set(trip.days!.map(d => d.id)));
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    {expandedDays.size > 0 ? "Colapsar todos" : "Expandir todos"}
                  </button>
                </>
              )}
            </div>
          </div>
          {hotelBulkOpen && trip.days.length > 0 && (
            <div className="border-b border-border px-5 py-4 animate-in fade-in slide-in-from-top-2 duration-200" style={{ background: "#FEFAF7" }}>
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

          {trip.days.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No hay días en este itinerario. Haz clic en "Añadir día" para empezar.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {trip.days.map(day => {
                const isExpanded = expandedDays.has(day.id);
                const isEditingThisDay = editingDayId === day.id;

                if (viewMode === "summary" && !isExpanded) {
                  return (
                    <div key={day.id} className="animate-in fade-in duration-200">
                      <CompactDayRow
                        day={day}
                        startDate={trip.startDate}
                        tripId={tripId}
                        onClick={() => toggleDay(day.id)}
                      />
                    </div>
                  );
                }

                return (
                  <div key={day.id} className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-start gap-4 px-5 py-3">
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[13px] font-medium"
                          style={{ background: "#FAEEE4", color: "#C4793A" }}>
                          {day.dayNumber}
                        </div>
                        {formatDayDate(trip.startDate, day.dayNumber) && (
                          <span className="text-[9px] text-muted-foreground text-center leading-tight" style={{ maxWidth: 42 }}>
                            {formatDayDate(trip.startDate, day.dayNumber)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
                          {day.cityFrom && day.cityTo
                            ? `${day.cityFrom} → ${day.cityTo}`
                            : day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                        </p>
                        {day.isTransitNight ? (
                          <p className="mt-0.5"><TransitNightBadge /></p>
                        ) : day.hotels && day.hotels.length > 0 && (
                          <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>🏨 {day.hotels.map(h => h.hotelName).join(", ")}</span>
                            {(() => {
                              const label = getNightLabel(trip.days.findIndex(d => d.id === day.id), trip.days);
                              return label ? <NightLabelBadge label={label} /> : null;
                            })()}
                          </p>
                        )}
                        {day.description && !isExpanded && (
                          <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{day.description}</p>
                        )}
                        {isExpanded && !isEditingThisDay && (
                          <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-3 space-y-4">
                            {day.description && (
                              <p className="text-[13px] text-muted-foreground leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/40">
                                {day.description}
                              </p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                {(() => {
                                  const label = getNightLabel(trip.days.findIndex(d => d.id === day.id), trip.days);
                                  return label ? (
                                    <div className="mb-1.5"><NightLabelBadge label={label} /></div>
                                  ) : null;
                                })()}
                                <DayHotelPanel entityType="trip" entityId={tripId} day={day} allDays={trip.days} invalidateKey={`/api/trips/${tripId}`} />
                              </div>
                              <DayActivitiesPanel entityType="trip" entityId={tripId} dayId={day.id} day={day} />
                            </div>
                          </div>
                        )}
                        {isEditingThisDay && (
                          <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-3">
                            <DayEditForm
                              day={day}
                              tripId={tripId}
                              allDays={trip.days}
                              onDone={() => setEditingDayId(null)}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button
                          onClick={() => {
                            setEditingDayId(isEditingThisDay ? null : day.id);
                            if (!isExpanded) toggleDay(day.id);
                          }}
                          className="p-1.5 rounded-[6px] text-muted-foreground hover:text-[#3D2F6B] hover:bg-[#EAE6F5] transition-colors"
                          title="Editar día"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleDay(day.id)}
                          className="p-1.5 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title={isExpanded ? "Colapsar" : "Ver detalle"}>
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
