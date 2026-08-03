import { Link, useParams } from "wouter";
import { ArrowLeft, Globe, Target, Tag, User, Lock } from "lucide-react";
import { useGetTravelerTravelProfile, ApiError } from "@workspace/api-client-react";
import { countryFlagEmoji } from "@/lib/country-flag";
import { COUNTRY_CODE_BY_NAME } from "@workspace/api-client-react";

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

function CountryPill({ name }: { name: string }) {
  const code = COUNTRY_CODE_BY_NAME[name];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium"
      style={{ background: "#FAEEE4", color: "var(--terra)" }}
    >
      {code && <span>{countryFlagEmoji(code)}</span>}
      {name}
    </span>
  );
}

export default function TravelerCompanionProfile() {
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id ?? "0");

  const { data: profile, isLoading, error } = useGetTravelerTravelProfile(userId);

  const backLink = (
    <div className="flex items-center gap-2 mb-1">
      <Link href="/traveler">
        <button className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver
        </button>
      </Link>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="h-40 bg-card border border-border rounded-[18px] animate-pulse" />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="bg-card border border-border rounded-[18px] p-8 flex flex-col items-center gap-2 text-center">
          <Lock className="w-6 h-6 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">
            Solo puedes ver el perfil de viajeros con los que compartes al menos un viaje.
          </p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const bg = avatarColor(profile.name);
  const ini = initials(profile.name);
  const nothingShared = !profile.visitedCountries && !profile.wantedCountries && !profile.tags;

  return (
    <div className="space-y-5">
      {backLink}

      <div className="bg-card border border-border rounded-[18px] p-6 flex flex-col items-center gap-3 text-center">
        <div
          className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-[28px] font-semibold text-white shadow-md"
          style={{ background: bg }}
        >
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
          ) : (
            ini || <User className="w-9 h-9" />
          )}
        </div>
        <h1 className="text-[22px] font-medium" style={{ color: "#2D1F0E" }}>{profile.name}</h1>
      </div>

      {nothingShared && (
        <p className="text-[13px] text-muted-foreground text-center py-4">
          {profile.name.split(" ")[0]} no ha compartido nada más de su perfil todavía.
        </p>
      )}

      {profile.visitedCountries && (
        <div className="bg-card border border-border rounded-[14px] p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>Países visitados</h2>
          </div>
          {profile.visitedCountries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Sin países todavía</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.visitedCountries.map(name => <CountryPill key={name} name={name} />)}
            </div>
          )}
        </div>
      )}

      {profile.wantedCountries && (
        <div className="bg-card border border-border rounded-[14px] p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>Quiere visitar</h2>
          </div>
          {profile.wantedCountries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Sin países todavía</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.wantedCountries.map(name => <CountryPill key={name} name={name} />)}
            </div>
          )}
        </div>
      )}

      {profile.tags && (
        <div className="bg-card border border-border rounded-[14px] p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>Tipo de viajero</h2>
          </div>
          {profile.tags.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Sin etiquetas todavía</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.tags.map(t => (
                <span
                  key={t.id}
                  className="px-3 py-1.5 rounded-full text-[13px] font-medium"
                  style={{ background: "#EDE9F7", color: "#3D2F6B" }}
                  title={t.description}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
