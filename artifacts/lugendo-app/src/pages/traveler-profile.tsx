import { Link } from "wouter";
import { useGetMyProfile, useGetMyTravelProfile, useUpdateMyTravelProfile } from "@workspace/api-client-react";
import { Globe, Luggage, Calendar, ArrowLeft, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MyCountriesSection } from "@/components/my-countries-section";
import { MyCountriesMap } from "@/components/my-countries-map";
import { TravelerAvatarEditor } from "@/components/traveler-avatar-editor";
import { TravelerTagSelector } from "@/components/traveler-tag-selector";
import { Switch } from "@/components/ui/switch";

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

function VisibilityRow({
  label, description, checked, onChange,
}: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ShareableProfileSection() {
  const qc = useQueryClient();
  const { data: travelProfile, isLoading } = useGetMyTravelProfile();
  const updateProfile = useUpdateMyTravelProfile({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/me/travel-profile"] }) },
  });

  if (isLoading || !travelProfile) {
    return <div className="h-56 bg-card border border-border rounded-[14px] animate-pulse" />;
  }

  const patch = (data: Parameters<typeof updateProfile.mutate>[0]["data"]) => {
    updateProfile.mutate({ data });
  };

  return (
    <div className="bg-card border border-border rounded-[14px] p-4 space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>Perfil compartible</h2>
      </div>
      <p className="text-[12px] text-muted-foreground pb-2">
        Solo lo ven tus compañeros de viaje. Todo empieza desactivado — actívalo bloque a bloque.
      </p>

      <div className="divide-y divide-border">
        <VisibilityRow
          label="Países visitados"
          description="Tu lista de países visitados, visible para tus compañeros"
          checked={travelProfile.showVisitedCountries}
          onChange={v => patch({ showVisitedCountries: v })}
        />
        <VisibilityRow
          label="Países que quiero visitar"
          description="Tu lista de países objetivo, visible para tus compañeros"
          checked={travelProfile.showWantedCountries}
          onChange={v => patch({ showWantedCountries: v })}
        />
        <VisibilityRow
          label="Etiquetas de tipo de viajero"
          description="Tu estilo de viaje e intereses, visibles para tus compañeros"
          checked={travelProfile.showTags}
          onChange={v => patch({ showTags: v })}
        />
        <VisibilityRow
          label="Compartir etiquetas con mi agencia"
          description="Permite que el equipo de tu agencia vea tus etiquetas individuales"
          checked={travelProfile.agencyTagsConsent}
          onChange={v => patch({ agencyTagsConsent: v })}
        />
      </div>

      <div className="pt-3">
        <TravelerTagSelector />
      </div>
    </div>
  );
}

export default function TravelerProfile() {
  const { data: profile, isLoading } = useGetMyProfile();
  const { data: travelProfile } = useGetMyTravelProfile();

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
        <TravelerAvatarEditor
          avatarUrl={travelProfile?.avatarUrl ?? null}
          name={profile.name}
          initials={ini}
          avatarColor={bg}
        />
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

      {/* Perfil compartible: etiquetas, foto y privacidad (#155) */}
      <ShareableProfileSection />

      {/* Mis países */}
      <MyCountriesSection />

      {/* Mapa de mis países */}
      <div className="space-y-2">
        <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>Mapa de mis países</h2>
        <MyCountriesMap />
      </div>
    </div>
  );
}
