import { useGetMyTripTravelAdvisories } from "@workspace/api-client-react";
import { TripSafetyAdvisories } from "@/components/trip-safety-advisories";

interface TripSafetyTabProps {
  tripId: number;
}

export function TripSafetyTab({ tripId }: TripSafetyTabProps) {
  const { data, isLoading } = useGetMyTripTravelAdvisories(tripId);

  return <TripSafetyAdvisories data={data} isLoading={isLoading} showMaucPromo={data?.international ?? false} />;
}
