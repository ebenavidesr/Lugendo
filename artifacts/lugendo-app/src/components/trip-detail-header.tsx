import { ArrowLeft, Users, Hotel, Share2, Pencil, X, Calendar } from "lucide-react";
import { Link } from "wouter";
import type { TravelerTripDetail, TravelerTripDetailStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Tab = "itinerary" | "travelers" | "safety" | "documents" | "checklist" | "packing" | "notes";

const TABS: { id: Tab; label: string }[] = [
  { id: "itinerary",  label: "Itinerario" },
  { id: "travelers",  label: "Viajeros" },
  { id: "safety",     label: "Viaja Seguro" },
  { id: "documents",  label: "Documentos" },
  { id: "checklist",  label: "Checklist" },
  { id: "packing",    label: "Equipaje" },
  { id: "notes",      label: "Notas" },
];

const statusBadge: Record<TravelerTripDetailStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "rgba(255,255,255,0.15)", color: "#ECD5B8", label: "Próximamente" },
  scheduled: { bg: "rgba(255,255,255,0.15)", color: "#ECD5B8", label: "Programado" },
  active:    { bg: "rgba(76,175,80,0.25)",   color: "#A5D6A7", label: "En curso" },
  finished:  { bg: "rgba(255,255,255,0.15)", color: "#ECD5B8", label: "Finalizado" },
  cancelled: { bg: "rgba(244,67,54,0.25)",   color: "#EF9A9A", label: "Cancelado" },
};

function fmtDate(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function computeProgress(startDate: string, endDate: string | null | undefined): number {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : start;
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

function uniqueHotelCount(days: TravelerTripDetail["days"]): number {
  const ids = new Set<number>();
  for (const day of days ?? []) {
    for (const h of day.hotels ?? []) {
      ids.add(h.hotelId);
    }
  }
  return ids.size;
}

function getDestinations(days: TravelerTripDetail["days"]): { display: string; all: string[]; hasMore: boolean } {
  const cities: string[] = [];
  const seen = new Set<string>();
  for (const day of days ?? []) {
    const city = day.cityTo ?? day.cityFrom;
    if (city && !seen.has(city)) {
      seen.add(city);
      cities.push(city);
    }
  }
  if (cities.length === 0) return { display: "", all: [], hasMore: false };
  if (cities.length <= 2) return { display: cities.join(" · "), all: cities, hasMore: false };
  return {
    display: `${cities[0]} · ${cities[1]} +${cities.length - 2}`,
    all: cities,
    hasMore: true
  };
}

function getCountdown(startDate: string, status: TravelerTripDetailStatus): string | null {
  if (status !== "draft") return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const diffTime = start.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0 && diffDays < 30) {
    return diffDays === 1 ? "Falta 1 día" : `Faltan ${diffDays} días`;
  }
  return null;
}

interface TripDetailHeaderProps {
  trip: TravelerTripDetail;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  canEdit: boolean;
  isOwner: boolean;
  editMode?: boolean;
  onEditClick: () => void;
  onShareClick: () => void;
}

export function TripDetailHeader({
  trip,
  activeTab,
  onTabChange,
  canEdit,
  isOwner,
  editMode = false,
  onEditClick,
  onShareClick,
}: TripDetailHeaderProps) {
  const progress = computeProgress(trip.startDate, trip.endDate);
  const hotelCount = uniqueHotelCount(trip.days);
  const destinationsData = getDestinations(trip.days);
  const countdown = getCountdown(trip.startDate, trip.status);
  const s = statusBadge[trip.status] ?? statusBadge.scheduled;

  const dateRange = trip.endDate
    ? `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}`
    : fmtDate(trip.startDate);

  return (
    <div style={{ background: "var(--indigo)", color: "#FAF2EB" }} className="rounded-[18px] overflow-hidden shadow-md">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <Link
          href="/traveler"
          className="inline-flex items-center gap-1.5 text-[12px] opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: "#FAF2EB" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Mis viajes
        </Link>
        <div className="flex items-center gap-2">
          {canEdit && trip.isPersonal && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onEditClick}
              className="h-7 gap-1.5 text-[12px] transition-opacity"
              style={{
                color: "#FAF2EB",
                opacity: editMode ? 1 : 0.75,
                background: editMode ? "rgba(255,255,255,0.15)" : "transparent",
              }}
            >
              {editMode ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              {editMode ? "Cerrar edición" : "Editar"}
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onShareClick}
              className="h-7 gap-1.5 text-[12px] opacity-75 hover:opacity-100"
              style={{ color: "#FAF2EB" }}
            >
              <Share2 className="w-3.5 h-3.5" />
              Compartir
            </Button>
          )}
        </div>
      </div>

      {/* Main header content */}
      <div className="px-5 pt-3 pb-4">
        {/* Status badge */}
        <div className="mb-2">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
            style={{ background: s.bg, color: s.color }}
          >
            {s.label}
          </span>
        </div>

        {/* Trip name */}
        <h1 className="font-serif text-[22px] leading-tight mb-1" style={{ color: "#FAF2EB" }}>
          {trip.name}
        </h1>

        {/* Agency or personal */}
        <p className="text-[12px] opacity-65 mb-3">
          {trip.agencyName ? trip.agencyName : "Viaje personal"}
        </p>

        {/* Date + destinations */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-[13px] opacity-80">{dateRange}</span>
          {destinationsData.display && (
            <>
              <span className="opacity-40 text-[11px]">·</span>
              {destinationsData.hasMore ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-[13px] opacity-80 hover:opacity-100 transition-opacity underline decoration-dotted decoration-white/30 underline-offset-4">
                      {destinationsData.display}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto min-w-[180px] p-3 border-none shadow-xl rounded-xl"
                    style={{ background: "var(--indigo)", color: "#FAF2EB" }}
                    align="start"
                  >
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wider opacity-50 font-medium mb-1">Itinerario completo</p>
                      <div className="flex flex-col gap-1.5">
                        {destinationsData.all.map((city, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[13px]">
                            <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold">
                              {idx + 1}
                            </span>
                            {city}
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="text-[13px] opacity-80">{destinationsData.display}</span>
              )}
            </>
          )}
        </div>

        {/* Pills: travelers + hotels */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(trip.travelerCount ?? 0) > 0 && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium"
              style={{ background: "rgba(255,255,255,0.12)", color: "#FAF2EB" }}
            >
              <Users className="w-3.5 h-3.5 opacity-70" />
              {trip.travelerCount} {(trip.travelerCount ?? 0) === 1 ? "viajero" : "viajeros"}
            </div>
          )}
          {hotelCount > 0 && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium"
              style={{ background: "rgba(255,255,255,0.12)", color: "#FAF2EB" }}
            >
              <Hotel className="w-3.5 h-3.5 opacity-70" />
              {hotelCount} {hotelCount === 1 ? "hotel" : "hoteles"}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {(trip.status === "active" || progress > 0) && (
          <div className="mb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] opacity-55 uppercase tracking-wider">Progreso del viaje</span>
              <span className="text-[10px] opacity-55">{Math.round(progress * 100)}%</span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round(progress * 100)}%`, background: "var(--terra)" }}
              />
            </div>
          </div>
        )}

        {/* Countdown */}
        {countdown && (
          <div className="mt-4 flex items-center gap-1.5 text-[12px] opacity-70">
            <Calendar className="w-3.5 h-3.5" />
            {countdown}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex border-t"
        style={{ borderColor: "rgba(255,255,255,0.12)" }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex-1 py-3 text-[12px] font-medium transition-colors relative"
            style={{
              color: activeTab === tab.id ? "#FAF2EB" : "rgba(250,242,235,0.45)",
              background: "transparent",
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full"
                style={{ background: "var(--terra)" }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
