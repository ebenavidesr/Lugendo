import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useSearchItineraries, TripType } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { LugendoCompass } from "@/components/logo";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ContactAgencyDialog } from "@/components/contact-agency-dialog";
import { MapPin, Search as SearchIcon } from "lucide-react";

const TRIP_TYPE_OPTIONS: { value: TripType; label: string }[] = [
  { value: "adventure", label: "Aventura" },
  { value: "beach", label: "Playa" },
  { value: "cultural", label: "Cultural" },
  { value: "culinary", label: "Gastronómico" },
  { value: "nature", label: "Naturaleza" },
  { value: "city", label: "Ciudad" },
  { value: "wellness", label: "Bienestar" },
  { value: "family", label: "Familiar" },
];

export default function SearchPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [destination, setDestination] = useState("");
  const [tripTypes, setTripTypes] = useState<TripType[]>([]);
  const [maxBudget, setMaxBudget] = useState("");
  const [contactTarget, setContactTarget] = useState<{ agencyId: number; agencyName: string; itineraryId: number; itineraryName: string } | null>(null);

  const openContact = (target: { agencyId: number; agencyName: string; itineraryId: number; itineraryName: string }) => {
    if (!user) { navigate("/login"); return; }
    setContactTarget(target);
  };

  const { data: results, isLoading } = useSearchItineraries({
    ...(destination.trim() ? { destination: destination.trim() } : {}),
    ...(tripTypes.length ? { tripTypes } : {}),
    ...(maxBudget ? { maxBudget: parseInt(maxBudget) } : {}),
  });

  return (
    <div className="min-h-screen font-sans" style={{ background: "#FAF2EB" }}>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <LugendoCompass size={48} variant="light" className="mb-3" />
          <h1 className="text-2xl font-serif" style={{ color: "#2D1F0E" }}>Explora viajes</h1>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-md">
            Descubre itinerarios publicados por agencias de viajes en Lugendo. Sin necesidad de cuenta.
          </p>
        </div>

        <div className="bg-card border border-border rounded-[14px] shadow-sm p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "#2D1F0E" }}>Destino</label>
              <Input placeholder="Marruecos, Perú…" value={destination} onChange={e => setDestination(e.target.value)} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "#2D1F0E" }}>
                Presupuesto máximo (€/persona)
              </label>
              <Input type="number" min={0} placeholder="1500" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1.5 block" style={{ color: "#2D1F0E" }}>Tipo de viaje</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {TRIP_TYPE_OPTIONS.map(opt => {
                const checked = tripTypes.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={v => setTripTypes(v ? [...tripTypes, opt.value] : tripTypes.filter(t => t !== opt.value))}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-12">Buscando itinerarios…</div>
        ) : !results?.length ? (
          <div className="text-center py-16">
            <SearchIcon className="w-8 h-8 mx-auto mb-3 opacity-40" style={{ color: "#9C7A58" }} />
            <p className="text-sm text-muted-foreground">No hay itinerarios que coincidan con tu búsqueda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(it => (
              <div key={it.id} className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden flex flex-col">
                <div className="h-36 bg-muted" style={it.coverPhotoUrl ? { backgroundImage: `url(${it.coverPhotoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#ECD5B8" }} />
                <div className="p-4 flex flex-col gap-1.5 flex-1">
                  <p className="font-medium text-[14px]" style={{ color: "#2D1F0E" }}>{it.name}</p>
                  <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {it.countries.join(", ") || it.region || "—"} · {it.numDays}d
                  </p>
                  <Link href={`/${it.agency.slug}`} className="text-[12px] font-medium mt-1" style={{ color: "#C4793A" }}>
                    {it.agency.name}
                  </Link>
                  {it.priceFrom != null && (
                    <p className="text-[12px]" style={{ color: "#2D1F0E" }}>
                      Desde <span className="font-medium">{it.priceFrom}€</span>/persona
                    </p>
                  )}
                  <button
                    onClick={() => openContact({ agencyId: it.agency.id, agencyName: it.agency.name, itineraryId: it.id, itineraryName: it.name })}
                    className="text-[12px] font-medium mt-auto pt-2 text-left"
                    style={{ color: "#C4793A" }}>
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
          agencyId={contactTarget.agencyId}
          agencyName={contactTarget.agencyName}
          itineraryId={contactTarget.itineraryId}
          itineraryName={contactTarget.itineraryName}
          onClose={() => setContactTarget(null)}
        />
      )}
    </div>
  );
}
