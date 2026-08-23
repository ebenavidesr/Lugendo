import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useGetPublicAgencyProfile } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { LugendoCompass } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ContactAgencyDialog } from "@/components/contact-agency-dialog";
import { MapPin, Mail, ArrowLeft } from "lucide-react";

export default function AgencyPublicProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: profile, isLoading, isError } = useGetPublicAgencyProfile(slug ?? "");
  const [contactTarget, setContactTarget] = useState<{ itineraryId?: number; itineraryName?: string } | null>(null);

  const openContact = (target?: { itineraryId?: number; itineraryName?: string }) => {
    if (!user) { navigate("/login"); return; }
    setContactTarget(target ?? {});
  };

  const goBack = () => {
    // Vuelve a la página real desde la que se navegó aquí (normalmente /buscar o el
    // detalle de un itinerario) usando el historial del navegador, en vez de un destino
    // fijo — funciona sea cual sea la página de origen.
    if (window.history.length > 1) window.history.back();
    else navigate("/buscar");
  };

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
      <div className="h-14 flex items-center" style={{ background: accent }}>
        <div className="max-w-4xl mx-auto px-4 w-full">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/90 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver
          </button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-14">
        <div className="bg-card border border-border rounded-[16px] shadow-sm p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-[14px] bg-white border border-border flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt={profile.name} className="w-full h-full object-contain p-2" />
              ) : (
                <LugendoCompass size={32} variant="light" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-serif" style={{ color: "#2D1F0E" }}>{profile.name}</h1>
            </div>
          </div>
          {profile.description && (
            // El contenido se sanitiza en el backend (sanitizeNoteHtml, solo etiquetas permitidas) antes de guardarse.
            <div
              className="text-[13px] text-muted-foreground mt-4 w-full leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_b]:font-semibold"
              dangerouslySetInnerHTML={{ __html: profile.description }}
            />
          )}
          <Button onClick={() => openContact()} className="gap-1.5 mt-4" style={{ background: accent, color: "white" }}>
            <Mail className="w-3.5 h-3.5" /> Contactar con la agencia
          </Button>
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
                <Link href={`/itinerarios/${it.id}`}>
                  <div className="h-36 bg-muted" style={it.coverPhotoUrl ? { backgroundImage: `url(${it.coverPhotoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#ECD5B8" }} />
                </Link>
                <div className="p-4 flex flex-col gap-1.5 flex-1">
                  <Link href={`/itinerarios/${it.id}`} className="font-medium text-[14px] hover:underline" style={{ color: "#2D1F0E" }}>
                    {it.name}
                  </Link>
                  <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {it.countries.join(", ") || it.region || "—"} · {it.numDays}d
                  </p>
                  <p className="text-[12px]" style={it.priceFrom != null ? { color: "#2D1F0E" } : { color: "#9C7A58" }}>
                    {it.priceFrom != null
                      ? <>Desde <span className="font-medium">{it.priceFrom}€</span>/persona</>
                      : "Precio a consultar"}
                  </p>
                  <button
                    onClick={() => openContact({ itineraryId: it.id, itineraryName: it.name })}
                    className="text-[12px] font-medium mt-auto pt-2 text-left"
                    style={{ color: accent }}>
                    Consultar sobre este viaje →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {contactTarget && (
        <ContactAgencyDialog
          agencyId={profile.id}
          agencyName={profile.name}
          itineraryId={contactTarget.itineraryId}
          itineraryName={contactTarget.itineraryName}
          onClose={() => setContactTarget(null)}
        />
      )}
    </div>
  );
}
