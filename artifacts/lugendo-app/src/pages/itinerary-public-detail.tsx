import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetPublicItinerary, getGetPublicItineraryQueryKey, PublicItineraryDay } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { LugendoCompass } from "@/components/logo";
import { TravelerHeader } from "@/components/layout/traveler-header";
import { ContactAgencyDialog } from "@/components/contact-agency-dialog";
import { DayPhotoZone } from "@/components/day-photo-editor";
import { TransitNightBadge } from "@/components/day-hotel-panel";
import { getTransportOption } from "@/components/transport-select";
import { MapPin, ArrowLeft, Mail, Hotel, ChevronDown, ChevronRight } from "lucide-react";

function dayTitle(day: PublicItineraryDay): string {
  if (day.cityFrom && day.cityTo) return `${day.cityFrom} → ${day.cityTo}`;
  return day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`;
}

function DayCard({ day, expanded, onToggle }: { day: PublicItineraryDay; expanded: boolean; onToggle: () => void }) {
  const hotel = day.hotels[0] ?? null;
  const transportOpt = getTransportOption(day.transport);

  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 bg-card border border-border rounded-[14px] text-left hover:bg-muted/40 transition-colors"
        style={{ minHeight: 44 }}>
        <div className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[11px] font-semibold shrink-0"
          style={{ background: "var(--indigo)", color: "#FAF2EB" }}>
          {day.dayNumber}
        </div>
        <div className="flex-1 min-w-0 py-2.5">
          <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>{dayTitle(day)}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {day.activities.length > 0 && (
              <span className="text-[11px]" style={{ color: "#9C7A58" }}>
                {day.activities.length} {day.activities.length === 1 ? "actividad" : "actividades"}
              </span>
            )}
            {day.isTransitNight ? <TransitNightBadge /> : hotel && (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--arena)", color: "#7A5C3A" }}>
                <Hotel className="w-3 h-3" /> {hotel.hotelName}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 opacity-30" />
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-[18px] overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 p-4">
        {day.photoUrl && (
          <div className="shrink-0">
            <DayPhotoZone photoUrl={day.photoUrl} editable={false} onSave={async () => {}} square={140} className="rounded-[10px]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-medium uppercase tracking-[0.5px]" style={{ color: "var(--terra)" }}>Día {day.dayNumber}</span>
              {(day.cityTo ?? day.cityFrom) && (
                <span className="text-[12px]" style={{ color: "var(--ocre)" }}>· {day.cityTo ?? day.cityFrom}</span>
              )}
            </div>
            <button onClick={onToggle} className="shrink-0 p-1.5 -m-1.5 rounded-[8px] opacity-70 hover:opacity-100 hover:bg-muted/40 transition-all" style={{ color: "var(--ocre)" }}>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          <h3 className="text-[17px] font-medium mt-1" style={{ color: "var(--noche)" }}>{dayTitle(day)}</h3>
          {transportOpt && (
            <p className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: "#9C7A58" }}>
              <span>{transportOpt.icon}</span> {transportOpt.label}
            </p>
          )}
          {day.description && (
            <p className="text-[12px] mt-2 leading-relaxed" style={{ color: "var(--noche)" }}>{day.description}</p>
          )}

          {day.isTransitNight ? (
            <div className="mt-3"><TransitNightBadge /></div>
          ) : hotel && (
            <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: "var(--noche)" }}>
              <Hotel className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--terra)" }} />
              <span className="font-medium">{hotel.hotelName}</span>
              {hotel.hotelCity && <span style={{ color: "#9C7A58" }}>· {hotel.hotelCity}</span>}
            </div>
          )}

          {day.activities.length > 0 && (
            <ul className="list-none m-0 p-0 mt-3">
              {day.activities.map((activity, idx) => (
                <li key={idx} className={idx > 0 ? "border-t" : ""} style={{ borderColor: "var(--arena)" }}>
                  <div className="flex items-start gap-2.5 py-2">
                    <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums" style={{ color: "var(--ocre)", minWidth: 44 }}>
                      {activity.startTime || "—"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px]" style={{ color: "var(--noche)" }}>{activity.activityName}</p>
                      {activity.notes && (
                        <p className="text-[11px] mt-0.5" style={{ color: "#9C7A58" }}>{activity.notes}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ItineraryPublicDetail() {
  const { id } = useParams<{ id: string }>();
  const itineraryId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: itinerary, isLoading, isError } = useGetPublicItinerary(itineraryId, {
    query: { queryKey: getGetPublicItineraryQueryKey(itineraryId), enabled: !!itineraryId },
  });
  // Todos los días vienen desplegados por defecto — se rastrea qué días se han
  // colapsado explícitamente, en vez de cuáles están expandidos.
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [contactOpen, setContactOpen] = useState(false);

  const toggleDay = (dayNumber: number) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber); else next.add(dayNumber);
      return next;
    });
  };

  const openContact = () => {
    if (!user) { navigate("/login"); return; }
    setContactOpen(true);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--arena)" }}>Cargando…</div>;
  }

  if (isError || !itinerary) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center" style={{ background: "var(--arena)" }}>
        <LugendoCompass size={40} variant="light" className="mb-4" />
        <p className="text-[15px]" style={{ color: "#2D1F0E" }}>Este itinerario no existe o ya no está publicado.</p>
        <Link href="/buscar" className="text-[13px] font-medium mt-3" style={{ color: "#C4793A" }}>← Volver al buscador</Link>
      </div>
    );
  }

  const accent = itinerary.agency.primaryColor || "#C4793A";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <TravelerHeader maxWidth="max-w-4xl" />

      <main className="max-w-4xl w-full mx-auto px-4 py-8 space-y-5">
        <div>
          <Link href="/buscar" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground mb-2 hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Explorar viajes
          </Link>
          <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>{itinerary.name}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {itinerary.countries.length > 0 && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" /> {itinerary.countries.join(", ")}
              </span>
            )}
            <span className="text-sm text-muted-foreground">{itinerary.numDays} días</span>
          </div>
          <Link href={`/${itinerary.agency.slug}`} className="text-[13px] font-medium mt-1.5 inline-block" style={{ color: accent }}>
            {itinerary.agency.name}
          </Link>
        </div>

        {/* CTA de contacto — destacado */}
        <div className="rounded-[14px] shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap" style={{ background: accent }}>
          <p className="text-[15px] font-medium text-white">
            ¿Te gusta este viaje? Ponte en contacto con la agencia para pedir más información
          </p>
          <button
            onClick={openContact}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-[13px] font-medium shrink-0 whitespace-nowrap"
            style={{ background: "#fff", color: accent }}>
            <Mail className="w-3.5 h-3.5" /> Contactar con la agencia
          </button>
        </div>

        {itinerary.description && (
          <div className="bg-card border border-border rounded-[14px] shadow-sm p-5">
            <p className="text-sm text-muted-foreground">{itinerary.description}</p>
          </div>
        )}

        <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Días ({itinerary.days.length})</span>
          </div>
          <div className="p-4 space-y-3">
            {itinerary.days.map(day => (
              <DayCard key={day.id} day={day} expanded={!collapsedDays.has(day.dayNumber)} onToggle={() => toggleDay(day.dayNumber)} />
            ))}
          </div>
        </div>
      </main>

      {contactOpen && (
        <ContactAgencyDialog
          agencyId={itinerary.agency.id}
          agencyName={itinerary.agency.name}
          itineraryId={itinerary.id}
          itineraryName={itinerary.name}
          onClose={() => setContactOpen(false)}
        />
      )}
    </div>
  );
}
