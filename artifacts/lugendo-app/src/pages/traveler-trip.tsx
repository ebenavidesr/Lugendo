import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { MapPin } from "lucide-react";
import { useGetMyTrip } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { TripDetailHeader } from "@/components/trip-detail-header";
import { TripDayCard } from "@/components/trip-day-card";
import { TripTravelersTab } from "@/components/trip-travelers-tab";
import { TripDocumentsTab } from "@/components/trip-documents-tab";
import { TripNotesTab } from "@/components/trip-notes-tab";

type ActiveTab = "itinerary" | "travelers" | "documents" | "notes";

function computeDefaultExpanded(days: { dayNumber: number }[], startDate: string): Set<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const msPerDay = 86400000;
  const daysElapsed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / msPerDay));
  const currentDayNumber = daysElapsed + 1;

  const expanded = new Set<number>();
  for (const d of days) {
    if (d.dayNumber === currentDayNumber || d.dayNumber === currentDayNumber + 1) {
      expanded.add(d.dayNumber);
    }
  }

  if (expanded.size === 0 && days.length > 0) {
    expanded.add(days[0].dayNumber);
    if (days.length > 1) expanded.add(days[1].dayNumber);
  }

  return expanded;
}

export default function TravelerTrip() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const { data: trip, isLoading } = useGetMyTrip(tripId);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<ActiveTab>("itinerary");

  const isOwner = !!(trip && user && trip.ownerId === user.id);
  const canEdit = isOwner || trip?.myPermission === "full";

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set<number>());

  useEffect(() => {
    if (!trip?.days || !trip.startDate) return;
    setExpandedDays(computeDefaultExpanded(trip.days, trip.startDate));
  }, [trip?.id, trip?.days?.length, trip?.startDate]);

  const toggleDay = (dayNumber: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-56 bg-card border border-border rounded-[18px] animate-pulse" />
        <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div>
        <p className="text-muted-foreground">Viaje no encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="-mx-4">
        <TripDetailHeader
          trip={trip}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          canEdit={canEdit}
          isOwner={isOwner}
          onEditClick={() => navigate(`/traveler/trips/${tripId}/edit`)}
          onShareClick={() => setActiveTab("travelers")}
        />
      </div>

      {activeTab === "itinerary" && (
        <>
          {trip.days && trip.days.length > 0 ? (
            <div className="space-y-3">
              {trip.days.map((day, idx) => (
                <TripDayCard
                  key={day.id}
                  day={day}
                  dayIndex={idx}
                  allDays={trip.days}
                  expanded={expandedDays.has(day.dayNumber)}
                  onToggle={() => toggleDay(day.dayNumber)}
                  tripId={tripId}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-[14px] p-8 text-center">
              <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--terra)" }} />
              <p className="text-sm text-muted-foreground">
                El itinerario detallado estará disponible próximamente
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === "travelers" && (
        <TripTravelersTab tripId={tripId} isOwner={isOwner} canEdit={canEdit} />
      )}

      {activeTab === "documents" && (
        <TripDocumentsTab tripId={tripId} trip={trip} />
      )}

      {activeTab === "notes" && (
        <TripNotesTab tripId={tripId} trip={trip} />
      )}

    </div>
  );
}
