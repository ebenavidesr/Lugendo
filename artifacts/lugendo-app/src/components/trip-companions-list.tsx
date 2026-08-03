import { useLocation } from "wouter";
import { Users } from "lucide-react";
import { useListTripMembers } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

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
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

// Entry point into a companion's shareable profile (#155): "El perfil se abre desde la
// lista de viajeros de un viaje, tocando el nombre o el avatar."
export function TripCompanionsList({ tripId }: { tripId: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data } = useListTripMembers(tripId);

  const companions = (data?.members ?? []).filter(m => m.id !== user?.id);
  if (companions.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-[14px] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>Compañeros de viaje</h2>
      </div>
      <div className="flex flex-wrap gap-3">
        {companions.map(c => (
          <button
            key={c.id}
            onClick={() => setLocation(`/traveler/travelers/${c.id}`)}
            className="flex flex-col items-center gap-1.5 w-16 group"
            title={c.name}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-semibold text-white shadow-sm group-hover:opacity-85 transition-opacity"
              style={{ background: avatarColor(c.name) }}
            >
              {initials(c.name)}
            </div>
            <span className="text-[11px] text-center leading-tight truncate w-full text-muted-foreground group-hover:text-foreground">
              {c.name.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
