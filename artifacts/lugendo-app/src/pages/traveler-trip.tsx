import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { MapPin, Plus } from "lucide-react";
import {
  useGetMyTrip, useUpdateMyTrip, useUpdateTripDay, useCreateTripDay, useDeleteTripDay,
} from "@workspace/api-client-react";
import type { TravelerTripDetailStatus, TransportMode } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { TripDetailHeader } from "@/components/trip-detail-header";
import { TripDayCard, type DayEditData } from "@/components/trip-day-card";
import { TripTravelersTab } from "@/components/trip-travelers-tab";
import { TripDocumentsTab } from "@/components/trip-documents-tab";
import { TripNotesTab } from "@/components/trip-notes-tab";
import { InlineField } from "@/components/inline-field";
import { FlightEditPanel } from "@/components/flight-edit-panel";
import type { FlightLeg } from "@/components/flight-edit-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type ActiveTab = "itinerary" | "travelers" | "documents" | "notes";

function computeDefaultExpanded(days: { dayNumber: number }[], startDate: string): Set<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const msPerDay = 86400000;
  const daysElapsed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / msPerDay));
  const currentDayNumber = daysElapsed + 1;

  const expanded = new Set<number>();
  for (const d of days) {
    if (d.dayNumber === currentDayNumber || d.dayNumber === currentDayNumber + 1) {
      expanded.add(d.dayNumber);
    }
  }

  if (expanded.size === 0 && days.length > 0) {
    expanded.add(days[0].dayNumber);
    if (days.length > 1) expanded.add(days[1].dayNumber);
  }

  return expanded;
}

function toApiLeg(l: FlightLeg) {
  return {
    airline: l.airline || undefined,
    flightNumber: l.flightNumber || undefined,
    cityFrom: l.cityFrom || undefined,
    cityTo: l.cityTo || undefined,
    departureTime: l.departureTime || undefined,
    arrivalTime: l.arrivalTime || undefined,
    reservationCode: l.reservationCode || undefined,
  };
}

function fromApiLeg(l: { airline?: string; flightNumber?: string; cityFrom?: string; cityTo?: string; departureTime?: string; arrivalTime?: string; reservationCode?: string; } | null | undefined): FlightLeg {
  return {
    airline: l?.airline ?? "",
    flightNumber: l?.flightNumber ?? "",
    cityFrom: l?.cityFrom ?? "",
    cityTo: l?.cityTo ?? "",
    departureTime: l?.departureTime ?? "",
    arrivalTime: l?.arrivalTime ?? "",
    reservationCode: l?.reservationCode ?? "",
  };
}

export default function TravelerTrip() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const { data: trip, isLoading } = useGetMyTrip(tripId);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>("itinerary");
  const [editMode, setEditMode] = useState(false);

  const isOwner = !!(trip && user && trip.ownerId === user.id);
  const canEdit = isOwner || trip?.myPermission === "full";
  const canEditPersonal = canEdit && !!trip?.isPersonal;

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set<number>());

  useEffect(() => {
    if (!trip?.days || !trip.startDate) return;
    setExpandedDays(computeDefaultExpanded(trip.days, trip.startDate));
  }, [trip?.id, trip?.days?.length, trip?.startDate]);

  const toggleDay = (dayNumber: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  };

  const updateMyTrip = useUpdateMyTrip();
  const updateDay = useUpdateTripDay();
  const createDay = useCreateTripDay();
  const deleteDay = useDeleteTripDay();

  const invalidateTrip = async () => {
    await qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}`] });
    await qc.invalidateQueries({ queryKey: ["/api/me/trips"] });
  };

  const saveTripField = async (patch: Record<string, unknown>) => {
    await updateMyTrip.mutateAsync({ tripId, data: patch as Parameters<typeof updateMyTrip.mutateAsync>[0]["data"] });
    await invalidateTrip();
  };

  const handleSaveFlights = async (data: { outboundFlights: FlightLeg[]; returnFlights: FlightLeg[] }) => {
    await updateMyTrip.mutateAsync({
      tripId,
      data: {
        outboundFlights: data.outboundFlights.map(toApiLeg),
        returnFlights: data.returnFlights.map(toApiLeg),
      },
    });
    await invalidateTrip();
    toast({ title: "Vuelos guardados" });
  };

  const handleSaveDay = async (dayId: number, dayNumber: number, data: DayEditData) => {
    await updateDay.mutateAsync({
      tripId,
      dayId,
      data: {
        dayNumber,
        cityFrom: data.cityFrom,
        cityTo: data.cityTo,
        country: data.country,
        transport: (data.transport ?? null) as TransportMode | null,
        description: data.description,
      },
    });
    await invalidateTrip();
    toast({ title: "Día actualizado" });
  };

  const handleDeleteDay = async (dayId: number) => {
    if (!confirm("¿Eliminar este día del itinerario?")) return;
    await deleteDay.mutateAsync({ tripId, dayId });
    await invalidateTrip();
    toast({ title: "Día eliminado" });
  };

  const handleAddDay = async () => {
    const days = trip?.days ?? [];
    const nextNum = days.length > 0 ? Math.max(...days.map(d => d.dayNumber)) + 1 : 1;
    await createDay.mutateAsync({
      tripId,
      data: { dayNumber: nextNum },
    });
    await invalidateTrip();
    toast({ title: `Día ${nextNum} añadido` });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-56 bg-card border border-border rounded-[18px] animate-pulse" />
        <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div>
        <p className="text-muted-foreground">Viaje no encontrado</p>
      </div>
    );
  }

  const outboundFlights: FlightLeg[] = trip.outboundFlights && trip.outboundFlights.length > 0
    ? trip.outboundFlights.map(fromApiLeg)
    : (trip.airline || trip.flightNumber)
      ? [fromApiLeg({ airline: trip.airline ?? "", flightNumber: trip.flightNumber ?? "", departureTime: trip.flightTime ?? "", reservationCode: trip.reservationCode ?? "" })]
      : [];

  const returnFlights: FlightLeg[] = trip.returnFlights && trip.returnFlights.length > 0
    ? trip.returnFlights.map(fromApiLeg)
    : [];

  return (
    <div className="space-y-4">
      <div className="-mx-4">
        <TripDetailHeader
          trip={trip}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          canEdit={canEdit}
          isOwner={isOwner}
          editMode={editMode}
          onEditClick={() => setEditMode(v => !v)}
          onShareClick={() => setActiveTab("travelers")}
        />
      </div>

      {/* Inline edit panel for personal trips */}
      {canEditPersonal && editMode && (
        <div className="bg-card border border-border rounded-[14px] p-5 space-y-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Información del viaje</p>

          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Nombre</p>
              <InlineField
                value={trip.name}
                onSave={v => saveTripField({ name: v })}
                displayClassName="text-[14px] font-medium"
                placeholder="Nombre del viaje"
              />
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Estado</p>
              <Select
                value={trip.status}
                onValueChange={v => void saveTripField({ status: v })}
              >
                <SelectTrigger className="h-8 text-[13px] w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Próximamente</SelectItem>
                  <SelectItem value="scheduled">Programado</SelectItem>
                  <SelectItem value="active">En curso</SelectItem>
                  <SelectItem value="finished">Finalizado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Fecha de salida</p>
                <InlineField
                  value={trip.startDate}
                  onSave={v => saveTripField({ startDate: v })}
                  type="date"
                  displayClassName="text-[13px]"
                />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Fecha de regreso</p>
                <InlineField
                  value={trip.endDate ?? ""}
                  onSave={v => saveTripField({ endDate: v || null })}
                  type="date"
                  emptyPlaceholder="Sin fecha"
                  displayClassName="text-[13px]"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <FlightEditPanel
              outboundFlights={outboundFlights}
              returnFlights={returnFlights}
              onSave={handleSaveFlights}
            />
          </div>
        </div>
      )}

      {activeTab === "itinerary" && (
        <>
          {trip.days && trip.days.length > 0 ? (
            <div className="space-y-3">
              {canEditPersonal && editMode && (
                <button
                  onClick={handleAddDay}
                  className="w-full flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[13px] font-medium border border-dashed border-border/80 hover:bg-muted/30 transition-colors"
                  style={{ color: "var(--indigo)" }}
                >
                  <Plus className="w-4 h-4" />
                  Añadir día al itinerario
                </button>
              )}
              {trip.days.map((day, idx) => (
                <TripDayCard
                  key={day.id}
                  day={day}
                  dayIndex={idx}
                  allDays={trip.days}
                  expanded={expandedDays.has(day.dayNumber)}
                  onToggle={() => toggleDay(day.dayNumber)}
                  tripId={tripId}
                  canEditDay={canEditPersonal && editMode}
                  onSaveDay={canEditPersonal && editMode ? (data) => handleSaveDay(day.id, day.dayNumber, data) : undefined}
                  onDeleteDay={canEditPersonal && editMode ? () => void handleDeleteDay(day.id) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {canEditPersonal && editMode && (
                <button
                  onClick={handleAddDay}
                  className="w-full flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[13px] font-medium border border-dashed border-border/80 hover:bg-muted/30 transition-colors"
                  style={{ color: "var(--indigo)" }}
                >
                  <Plus className="w-4 h-4" />
                  Añadir primer día
                </button>
              )}
              <div className="bg-card border border-border rounded-[14px] p-8 text-center">
                <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--terra)" }} />
                <p className="text-sm text-muted-foreground">
                  El itinerario detallado estará disponible próximamente
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "travelers" && (
        <TripTravelersTab tripId={tripId} isOwner={isOwner} canEdit={canEdit} />
      )}

      {activeTab === "documents" && (
        <TripDocumentsTab tripId={tripId} trip={trip} />
      )}

      {activeTab === "notes" && (
        <TripNotesTab tripId={tripId} trip={trip} />
      )}

    </div>
  );
}
