import { useParams } from "wouter";
import { useGetPublicAgencyProfile } from "@workspace/api-client-react";
import { LugendoCompass } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { MapPin, Mail } from "lucide-react";

export default function AgencyPublicProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { data: profile, isLoading, isError } = useGetPublicAgencyProfile(slug ?? "");

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAF2EB" }}>Cargando…</div>;
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center" style={{ background: "#FAF2EB" }}>
        <LugendoCompass size={40} variant="light" className="mb-4" />
        <p className="text-[15px]" style={{ color: "#2D1F0E" }}>Esta página no existe o la agencia no la ha publicado.</p>
      </div>
    );
  }

  const accent = profile.primaryColor || "#C4793A";

  return (
    <div className="min-h-screen font-sans" style={{ background: "#FAF2EB" }}>
      <div className="h-40" style={{ background: accent }} />
      <div className="max-w-4xl mx-auto px-4 -mt-14 pb-14">
        <div className="bg-card border border-border rounded-[16px] shadow-sm p-6 mb-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-20 h-20 rounded-[14px] bg-white border border-border flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt={profile.name} className="w-full h-full object-contain p-2" />
              ) : (
                <LugendoCompass size={32} variant="light" />
              )}
            </div>
            <div className="flex-1 min-w-[200px]">
              <h1 className="text-xl font-serif" style={{ color: "#2D1F0E" }}>{profile.name}</h1>
              {profile.description && (
                <p className="text-[13px] text-muted-foreground mt-1.5 max-w-xl">{profile.description}</p>
              )}
            </div>
            <Button disabled title="Próximamente" className="gap-1.5 opacity-60 cursor-not-allowed" style={{ background: accent, color: "white" }}>
              <Mail className="w-3.5 h-3.5" /> Contactar con la agencia
            </Button>
          </div>
        </div>

        <h2 className="text-[13px] font-medium uppercase tracking-wider mb-3" style={{ color: "#9C7A58" }}>
          Itinerarios publicados
        </h2>

        {profile.itineraries.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-[14px]">
            <p className="text-sm text-muted-foreground">Esta agencia todavía no ha publicado ningún itinerario.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profile.itineraries.map(it => (
              <div key={it.id} className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden flex flex-col">
                <div className="h-36 bg-muted" style={it.coverPhotoUrl ? { backgroundImage: `url(${it.coverPhotoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#ECD5B8" }} />
                <div className="p-4 flex flex-col gap-1.5 flex-1">
                  <p className="font-medium text-[14px]" style={{ color: "#2D1F0E" }}>{it.name}</p>
                  <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {it.countries.join(", ") || it.region || "—"} · {it.numDays}d
                  </p>
                  {it.priceFrom != null && (
                    <p className="text-[12px] mt-auto pt-2" style={{ color: "#2D1F0E" }}>
                      Desde <span className="font-medium">{it.priceFrom}€</span>/persona
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
