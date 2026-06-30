import { Link } from "wouter";
import { useGetMyProfile } from "@workspace/api-client-react";
import { MapPin, Globe, Luggage, Calendar, ArrowLeft, User } from "lucide-react";

function avatarColor(name: string): string {
  const colors = [
    "#C4793A", "#3D2F6B", "#8B4420", "#2E7D5A",
    "#7A4A8B", "#1F5E7A", "#7A3A2E", "#4A7A3A",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-4 flex flex-col items-center gap-1.5">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-[22px] font-medium" style={{ color: "#2D1F0E" }}>{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

export default function TravelerProfile() {
  const { data: profile, isLoading } = useGetMyProfile();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-40 bg-card border border-border rounded-[18px] animate-pulse" />
        <div className="h-24 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-32 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!profile) return null;

  const bg = avatarColor(profile.name);
  const ini = initials(profile.name);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/traveler">
          <button className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Mis viajes
          </button>
        </Link>
      </div>

      {/* Avatar + name */}
      <div className="bg-card border border-border rounded-[18px] p-6 flex flex-col items-center gap-3 text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-[28px] font-semibold text-white shadow-md"
          style={{ background: bg }}
        >
          {ini || <User className="w-9 h-9" />}
        </div>
        <div>
          <h1 className="text-[22px] font-medium" style={{ color: "#2D1F0E" }}>{profile.name}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{profile.email}</p>
        </div>
        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span>Viajero desde {fmtDate(profile.createdAt)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Luggage className="w-5 h-5" />}
          label="Viajes"
          value={profile.tripCount}
        />
        <StatCard
          icon={<Globe className="w-5 h-5" />}
          label="Países"
          value={profile.countriesVisited.length}
        />
      </div>

      {/* Countries visited */}
      <div className="bg-card border border-border rounded-[14px] p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4" style={{ color: "#C4793A" }} />
          <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>
            Países visitados
          </h2>
        </div>

        {profile.countriesVisited.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: "#FAEEE4" }}>
              <Globe className="w-5 h-5" style={{ color: "#C4793A" }} />
            </div>
            <p className="text-[14px] font-medium mb-1" style={{ color: "#2D1F0E" }}>
              Todavía sin destinos
            </p>
            <p className="text-[12px] text-muted-foreground max-w-xs">
              Los países de tus viajes aparecerán aquí cuando tengas viajes con destinos asignados.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.countriesVisited.map(country => (
              <span
                key={country}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium"
                style={{ background: "#EAE6F5", color: "#3D2F6B" }}
              >
                <MapPin className="w-3 h-3" />
                {country}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
