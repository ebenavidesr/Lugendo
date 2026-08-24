import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useSearchItineraries, TripType } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { TravelerHeader } from "@/components/layout/traveler-header";
import { ItineraryFilterBar } from "@/components/itinerary-filter-bar";
import { ContactAgencyDialog } from "@/components/contact-agency-dialog";
import { MapPin, Search as SearchIcon } from "lucide-react";

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
    <div className="min-h-screen bg-background text-foreground font-sans">
      <TravelerHeader />

      <main className="max-w-3xl w-full mx-auto px-4 py-8 font-sans">
        <div className="mb-6">
          <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>Explora viajes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Descubre itinerarios publicados por agencias de viajes en Lugendo. Sin necesidad de cuenta.
          </p>
        </div>

        <ItineraryFilterBar
          destination={destination}
          onDestinationChange={setDestination}
          maxBudget={maxBudget}
          onMaxBudgetChange={setMaxBudget}
          tripTypes={tripTypes}
          onTripTypesChange={setTripTypes}
        />

        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-12">Buscando itinerarios…</div>
        ) : !results?.length ? (
          <div className="text-center py-16">
            <SearchIcon className="w-8 h-8 mx-auto mb-3 opacity-40" style={{ color: "#9C7A58" }} />
            <p className="text-sm text-muted-foreground">No hay itinerarios que coincidan con tu búsqueda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map(it => (
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
                  <Link href={`/${it.agency.slug}`} className="text-[12px] font-medium mt-1" style={{ color: "#C4793A" }}>
                    {it.agency.name}
                  </Link>
                  <p className="text-[12px]" style={it.priceFrom != null ? { color: "#2D1F0E" } : { color: "#9C7A58" }}>
                    {it.priceFrom != null
                      ? <>Desde <span className="font-medium">{it.priceFrom}€</span>/persona</>
                      : "Precio a consultar"}
                  </p>
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
      </main>

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
