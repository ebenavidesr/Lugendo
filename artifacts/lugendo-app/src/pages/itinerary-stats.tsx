import { useParams, Link } from "wouter";
import { ArrowLeft, Map, Users, TrendingUp, Trophy, Coins } from "lucide-react";
import { useGetItinerary, useGetItineraryStats } from "@workspace/api-client-react";
import type { ItineraryStatsTrip, TripStatus } from "@workspace/api-client-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/hooks/use-auth";

const statusBadge: Record<TripStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#ECD5B8", color: "#7A5C3A", label: "Borrador" },
  scheduled: { bg: "#EAE6F5", color: "#3D2F6B", label: "Programado" },
  active:    { bg: "#E4F3EC", color: "#2E7D5A", label: "Activo" },
  finished:  { bg: "#E5D4BF", color: "#9C7A58", label: "Finalizado" },
  cancelled: { bg: "#FDECEA", color: "#C0392B", label: "Cancelado" },
};

function fmtEur(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ItineraryStats() {
  const { id } = useParams<{ id: string }>();
  const itineraryId = parseInt(id, 10);
  const { data: itinerary } = useGetItinerary(itineraryId);
  const { data: stats, isLoading } = useGetItineraryStats(itineraryId);
  const { user } = useAuth();
  const revenueNote = user?.role === "admin"
    ? "Los ingresos son una estimación (10€/viajero, fee de plataforma) hasta que exista un dato de facturación real."
    : "Los ingresos son una estimación (viajeros × precio \"desde\" del itinerario) hasta que exista un dato de facturación real.";

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div>
        <Link href={`/itineraries/${itineraryId}`}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground mb-2 hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> {itinerary?.name ?? "Itinerario"}
        </Link>
        <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>Estadísticas</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[14px] p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Viajes creados" value={stats?.tripCount ?? 0} icon={Map} accent="#EAE6F5" />
            <StatCard label="Total viajeros" value={stats?.totalTravelers ?? 0} icon={Users} accent="#FAEEE4" />
            <StatCard label="Viajeros / viaje" value={(stats?.avgTravelersPerTrip ?? 0).toFixed(1)} icon={TrendingUp} accent="#E4F3EC" />
            <StatCard label="Ingresos totales" value={fmtEur(stats?.totalRevenue ?? 0)} icon={Trophy} accent="#ECD5B8" />
            <StatCard label="Ingresos / viaje" value={fmtEur(stats?.avgRevenuePerTrip ?? 0)} icon={Coins} accent="#FAEEE4" />
          </div>
          <p className="text-xs text-muted-foreground">{revenueNote}</p>

          <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Viajes vinculados</span>
            </div>
            {!stats?.trips?.length ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Este itinerario todavía no tiene viajes vinculados
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    {["Nombre", "Inicio", "Fin", "Estado", "Viajeros", ""].map(h => (
                      <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                        style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.trips.map((trip: ItineraryStatsTrip) => {
                    const badge = statusBadge[trip.status] ?? statusBadge.draft;
                    return (
                      <tr key={trip.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors">
                        <td className="px-5 py-3 font-medium" style={{ color: "#2D1F0E" }}>{trip.name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{fmtDate(trip.startDate)}</td>
                        <td className="px-5 py-3 text-muted-foreground">{trip.endDate ? fmtDate(trip.endDate) : "—"}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                            style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{trip.travelerCount}</td>
                        <td className="px-5 py-3 text-right">
                          <Link href={`/trips/${trip.id}`} className="text-[12px] font-medium hover:underline" style={{ color: "#C4793A" }}>
                            Ver viaje
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
