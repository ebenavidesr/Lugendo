import { useEffect } from "react";
import { useParams, useLocation } from "wouter";

export default function TravelerTripEdit() {
  const params = useParams<{ id: string }>();
  const tripId = params.id ?? "0";
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate(`/traveler/trips/${tripId}`, { replace: true });
  }, [tripId, navigate]);

  return null;
}
