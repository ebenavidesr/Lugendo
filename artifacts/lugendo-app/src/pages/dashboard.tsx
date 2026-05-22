import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Link } from "wouter";
import { MapPin, Users, Plane, CalendarDays, ArrowRight, TrendingUp } from "lucide-react";
import type { Trip, Invitation, TripStatus } from "@workspace/api-client-react";

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
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: number | string; sub?: string; icon: React.ElementType; accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-[32px] font-medium leading-none mt-1.5" style={{ color: "#2D1F0E" }}>{value}</p>
          {sub && <p className="text-xs mt-1 text-muted-foreground">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: accent ?? "#FAEEE4" }}>
          <Icon className="w-4.5 h-4.5" style={{ color: "#C4793A" }} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[14px] p-5 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const s = data?.tripsByStatus;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Centro de Control</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Resumen de operaciones de la agencia</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Viajes activos" value={s?.active ?? 0} icon={Plane} accent="#E4F3EC" />
        <StatCard label="Programados" value={s?.scheduled ?? 0} icon={CalendarDays} accent="#EAE6F5" />
        <StatCard label="Total viajeros" value={data?.totalTravelers ?? 0} icon={Users} accent="#FAEEE4" />
        <StatCard label="Próximos viajes" value={data?.upcomingTrips?.length ?? 0} icon={TrendingUp} accent="#ECD5B8" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Próximos viajes</span>
            <Link href="/trips" className="text-[12px] font-medium flex items-center gap-1" style={{ color: "#C4793A" }}>
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {!data?.upcomingTrips?.length ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No hay viajes próximos</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  {["Nombre", "Inicio", "Estado", "Viajeros"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                      style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.upcomingTrips.map((trip: Trip) => (
                  <tr key={trip.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/trips/${trip.id}`} className="font-medium hover:underline" style={{ color: "#2D1F0E" }}>
                        {trip.name}
                      </Link>
                      {trip.itineraryName && <div className="text-[11px] text-muted-foreground mt-0.5">{trip.itineraryName}</div>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{fmt(trip.startDate)}</td>
                    <td className="px-5 py-3"><StatusBadge status={trip.status} /></td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {trip.acceptedCount ?? 0}{trip.maxCapacity ? `/${trip.maxCapacity}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Últimas invitaciones</span>
          </div>
          {!data?.recentInvitations?.length ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Sin invitaciones recientes</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.recentInvitations.slice(0, 8).map((inv: Invitation) => (
                <li key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                      {inv.travelerName ?? inv.email}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{inv.email}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                    inv.status === "accepted"
                      ? "text-[#2E7D5A]"
                      : inv.status === "declined"
                      ? "text-[#C0392B]"
                      : "text-[#3D2F6B]"
                  }`} style={{
                    background: inv.status === "accepted" ? "#E4F3EC" : inv.status === "declined" ? "#FDECEA" : "#EAE6F5"
                  }}>
                    {inv.status === "accepted" ? "Aceptada" : inv.status === "declined" ? "Rechazada" : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
