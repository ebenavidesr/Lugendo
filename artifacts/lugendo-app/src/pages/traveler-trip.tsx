import { useParams, Link } from "wouter";
import { ArrowLeft, Plane, Calendar, MapPin, Hotel } from "lucide-react";
import { useGetMyTrip } from "@workspace/api-client-react";
import type { TravelerTripDetailStatus, TripDay } from "@workspace/api-client-react";

const statusBadge: Record<TravelerTripDetailStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#ECD5B8", color: "#7A5C3A", label: "Próximamente" },
  scheduled: { bg: "#EAE6F5", color: "#3D2F6B", label: "Programado" },
  active:    { bg: "#E4F3EC", color: "#2E7D5A", label: "En curso" },
  finished:  { bg: "#E5D4BF", color: "#9C7A58", label: "Finalizado" },
  cancelled: { bg: "#FDECEA", color: "#C0392B", label: "Cancelado" },
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>{value}</p>
    </div>
  );
}

export default function TravelerTrip() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const { data: trip, isLoading } = useGetMyTrip(tripId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div>
        <Link href="/traveler" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Mis viajes
        </Link>
        <p className="text-muted-foreground">Viaje no encontrado</p>
      </div>
    );
  }

  const s = statusBadge[trip.status] ?? statusBadge.scheduled;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/traveler" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground mb-2 hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Mis viajes
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>{trip.name}</h1>
            {trip.agencyName && <p className="text-sm text-muted-foreground mt-0.5">{trip.agencyName}</p>}
          {trip.isPersonal && <p className="text-sm mt-0.5" style={{ color: "#C4793A" }}>Viaje personal</p>}
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium shrink-0"
            style={{ background: s.bg, color: s.color }}>{s.label}</span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard icon={Calendar} label="Inicio" value={fmt(trip.startDate)} />
        <InfoCard icon={Calendar} label="Fin" value={trip.endDate ? fmt(trip.endDate) : "—"} />
        {trip.flightNumber && <InfoCard icon={Plane} label="Vuelo" value={trip.flightNumber} />}
        {trip.reservationCode && <InfoCard icon={Plane} label="Código reserva" value={trip.reservationCode} />}
      </div>

      {/* Flight details box */}
      {(trip.airline || trip.flightTime || trip.flightNotes) && (
        <div className="bg-card border border-border rounded-[14px] p-5">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Información de vuelo
          </p>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            {trip.airline && (
              <div>
                <p className="text-muted-foreground text-[11px] mb-0.5">Aerolínea</p>
                <p className="font-medium" style={{ color: "#2D1F0E" }}>{trip.airline}</p>
              </div>
            )}
            {trip.flightTime && (
              <div>
                <p className="text-muted-foreground text-[11px] mb-0.5">Hora de salida</p>
                <p className="font-medium" style={{ color: "#2D1F0E" }}>{trip.flightTime}</p>
              </div>
            )}
          </div>
          {trip.flightNotes && (
            <div className="mt-3 p-3 rounded-[8px] text-[13px] text-muted-foreground" style={{ background: "#FAF2EB" }}>
              {trip.flightNotes}
            </div>
          )}
        </div>
      )}

      {/* Day-by-day itinerary */}
      {trip.days && trip.days.length > 0 && (
        <div>
          <h2 className="text-[15px] font-medium mb-3" style={{ color: "#2D1F0E" }}>
            Itinerario día a día
          </h2>
          <div className="space-y-3">
            {trip.days.map((day: TripDay) => (
              <div key={day.id} className="bg-card border border-border rounded-[14px] p-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0 font-medium text-[14px]"
                    style={{ background: "#FAEEE4", color: "#C4793A" }}>
                    {day.dayNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#C4793A" }}>
                        Día {day.dayNumber}
                      </span>
                      {day.transport && (
                        <span className="text-[11px] text-muted-foreground">· {day.transport}</span>
                      )}
                    </div>
                    <p className="text-[15px] font-medium mt-0.5" style={{ color: "#2D1F0E" }}>
                      {day.cityFrom && day.cityTo
                        ? `${day.cityFrom} → ${day.cityTo}`
                        : day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                    </p>

                    {day.hotelName && (
                      <div className="flex items-center gap-1.5 mt-2 p-2.5 rounded-[8px]" style={{ background: "#FAF2EB" }}>
                        <Hotel className="w-3.5 h-3.5 shrink-0" style={{ color: "#C4793A" }} />
                        <span className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>{day.hotelName}</span>
                      </div>
                    )}

                    {day.description && (
                      <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">{day.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trip.days && trip.days.length === 0 && (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center">
          <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "#C4793A" }} />
          <p className="text-sm text-muted-foreground">El itinerario detallado estará disponible próximamente</p>
        </div>
      )}
    </div>
  );
}
