import { Camera, Hotel, ChevronRight, Star } from "lucide-react";
import type { TripDay, TripDayActivityItem } from "@workspace/api-client-react";

type ActivityTag = "Visita" | "Gastronomía" | "Traslado" | "Libre";

const TAG_STYLE: Record<ActivityTag, { bg: string; color: string }> = {
  "Visita":      { bg: "#EAE6F5", color: "#3D2F6B" },
  "Gastronomía": { bg: "#FAEEE4", color: "#8B4420" },
  "Traslado":    { bg: "#ECD5B8", color: "#7A5C3A" },
  "Libre":       { bg: "#F0F4F0", color: "#4A6A4A" },
};

function getActivityTag(category: string | null | undefined): ActivityTag {
  switch (category) {
    case "cultural":
    case "city":
    case "excursion":
      return "Visita";
    case "gastronomic":
      return "Gastronomía";
    case "transport":
      return "Traslado";
    default:
      return "Libre";
  }
}

function nightLabel(dayIndex: number, allDays: TripDay[]): string | null {
  const day = allDays[dayIndex];
  const currentHotelId = day?.hotels?.[0]?.hotelId;
  if (!currentHotelId) return null;

  let nights = 1;
  for (let i = dayIndex - 1; i >= 0; i--) {
    const prevHotelId = allDays[i]?.hotels?.[0]?.hotelId;
    if (prevHotelId === currentHotelId) {
      nights++;
    } else {
      break;
    }
  }
  if (nights === 1) return null;

  const ordinals = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª"];
  const label = ordinals[nights - 1] ?? `${nights}ª`;
  return `${label} noche`;
}

function dayTitle(day: TripDay): string {
  if (day.cityFrom && day.cityTo) return `${day.cityFrom} → ${day.cityTo}`;
  return day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`;
}

interface TripDayCardProps {
  day: TripDay;
  dayIndex: number;
  allDays: TripDay[];
  expanded: boolean;
  onToggle: () => void;
}

export function TripDayCard({ day, dayIndex, allDays, expanded, onToggle }: TripDayCardProps) {
  const hotel = day.hotels?.[0] ?? null;
  const activities: TripDayActivityItem[] = day.activities ?? [];
  const hotelNightLabel = nightLabel(dayIndex, allDays);

  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 bg-card border border-border rounded-[14px] text-left hover:bg-muted/40 transition-colors"
        style={{ minHeight: 44 }}
      >
        {/* Day number badge */}
        <div
          className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 text-[11px] font-semibold"
          style={{ background: "var(--indigo)", color: "#FAF2EB" }}
        >
          {day.dayNumber}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0 py-2.5">
          <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
            {dayTitle(day)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {activities.length > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-ter)" }}>
                {activities.length} {activities.length === 1 ? "actividad" : "actividades"}
              </span>
            )}
            {hotel && (
              <span
                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--arena)", color: "var(--text-sec)" }}
              >
                <Hotel className="w-3 h-3" />
                {hotel.hotelName}
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
      {/* Photo zone */}
      <div
        className="relative flex items-center justify-center cursor-pointer"
        style={{ height: 134, background: "var(--duna)" }}
        onClick={onToggle}
      >
        {/* Camera placeholder */}
        <Camera className="w-8 h-8 opacity-30" style={{ color: "var(--noche)" }} />

        {/* Day number badge — top left */}
        <div
          className="absolute top-3 left-3 px-2.5 py-1 rounded-[8px] text-[12px] font-semibold shadow"
          style={{ background: "var(--indigo)", color: "#FAF2EB" }}
        >
          Día {day.dayNumber}
        </div>

        {/* Temperature slot — top right (empty for now) */}
        <div className="absolute top-3 right-3 w-10 h-7" />
      </div>

      {/* Day title + destination */}
      <div className="px-4 pt-3 pb-0">
        <h3 className="text-[16px] font-medium" style={{ color: "var(--noche)" }}>
          {dayTitle(day)}
        </h3>
        {day.description && (
          <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-sec)" }}>
            {day.description}
          </p>
        )}
      </div>

      {/* Hotel row */}
      {hotel && (
        <div
          className="mx-4 mt-3 flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-default"
          style={{ background: "var(--arena)" }}
        >
          <Hotel className="w-4 h-4 shrink-0" style={{ color: "var(--terra)" }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
                {hotel.hotelName}
              </p>
              {/* Stars derived from segment */}
              {hotel.segment === "premium" && (
                <span className="inline-flex items-center gap-0.5 shrink-0">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-2.5 h-2.5 fill-current" style={{ color: "var(--terra)" }} />)}
                </span>
              )}
              {hotel.segment === "standard" && (
                <span className="inline-flex items-center gap-0.5 shrink-0">
                  {[1,2,3].map(i => <Star key={i} className="w-2.5 h-2.5 fill-current" style={{ color: "var(--terra)" }} />)}
                </span>
              )}
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-ter)" }}>
              {hotelNightLabel
                ? [hotelNightLabel, hotel.hotelCity].filter(Boolean).join(" · ")
                : ["Check-in", hotel.hotelCity].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-25" />
        </div>
      )}

      {/* Activities list */}
      {activities.length > 0 && (
        <div className="mt-3">
          <div
            className="mx-4 mb-0 text-[10px] font-semibold uppercase tracking-wider opacity-50"
            style={{ color: "var(--noche)" }}
          >
            Actividades
          </div>
          <div className="mt-1.5">
            {activities.map((activity, idx) => {
              const tag = getActivityTag(activity.activityCategory);
              const tagStyle = TAG_STYLE[tag];
              return (
                <div key={activity.id}>
                  {idx > 0 && (
                    <div
                      className="mx-4"
                      style={{ height: "0.5px", background: "var(--lg-border)" }}
                    />
                  )}
                  <div className="flex items-center gap-2.5 px-4 py-2.5">
                    {/* Time */}
                    <span
                      className="text-[12px] font-semibold w-12 shrink-0 tabular-nums"
                      style={{ color: activity.startTime ? "var(--terra)" : "transparent" }}
                    >
                      {activity.startTime ?? "00:00"}
                    </span>

                    {/* Dot */}
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: "var(--terra)" }}
                    />

                    {/* Name */}
                    <p
                      className="flex-1 text-[13px] font-medium truncate"
                      style={{ color: "var(--noche)" }}
                    >
                      {activity.activityName}
                    </p>

                    {/* Tag */}
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: tagStyle.bg, color: tagStyle.color }}
                    >
                      {tag}
                    </span>

                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-20" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state for activities */}
      {activities.length === 0 && !hotel && (
        <p className="px-4 pt-2 pb-4 text-[12px] italic" style={{ color: "var(--text-ter)" }}>
          Sin actividades ni alojamiento para este día.
        </p>
      )}

      {/* Bottom padding */}
      <div className="h-4" />
    </div>
  );
}
