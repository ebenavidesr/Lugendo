import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { tripsTable, tripSharesTable } from "@workspace/db";

// No hay todavía ningún dato de facturación real por viaje/viajero en el schema (ni tabla de
// pagos, ni integración con Stripe). Hasta que exista (#92 — Módulo de facturación), usamos
// como aproximación el fee de 10€/viajero del modelo de negocio.
// TODO: sustituir por dato de facturación real cuando exista.
export const PLACEHOLDER_FEE_PER_TRAVELER_EUR = 10;

export interface ItineraryTripStat {
  id: number;
  itineraryId: number | null;
  name: string;
  startDate: string;
  endDate: string | null;
  status: string;
  travelerCount: number;
  revenue: number;
}

// Trips vinculados a los itinerarios dados, con nº de viajeros (aceptados, origin=agency) e
// ingresos (placeholder) por viaje. Compartido entre el endpoint de estadísticas de un
// itinerario individual (#172) y el de estadísticas agregadas del dashboard (#174) para no
// duplicar la lógica de cálculo.
export async function getTripStatsForItineraries(itineraryIds: number[]): Promise<ItineraryTripStat[]> {
  if (itineraryIds.length === 0) return [];

  const trips = await db
    .select({
      id: tripsTable.id,
      itineraryId: tripsTable.itineraryId,
      name: tripsTable.name,
      startDate: tripsTable.startDate,
      endDate: tripsTable.endDate,
      status: tripsTable.status,
    })
    .from(tripsTable)
    .where(inArray(tripsTable.itineraryId, itineraryIds));

  if (trips.length === 0) return [];

  const travelerCounts = await db
    .select({
      tripId: tripSharesTable.tripId,
      count: sql<number>`count(distinct ${tripSharesTable.sharedWithUserId})::int`,
    })
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.origin, "agency"),
      eq(tripSharesTable.status, "accepted"),
      inArray(tripSharesTable.tripId, trips.map(t => t.id)),
    ))
    .groupBy(tripSharesTable.tripId);
  const countMap = Object.fromEntries(travelerCounts.map(t => [t.tripId, t.count]));

  return trips.map(t => {
    const travelerCount = countMap[t.id] ?? 0;
    return {
      id: t.id,
      itineraryId: t.itineraryId,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      travelerCount,
      revenue: travelerCount * PLACEHOLDER_FEE_PER_TRAVELER_EUR,
    };
  });
}

export interface TripStatsSummary {
  tripCount: number;
  totalTravelers: number;
  avgTravelersPerTrip: number;
  totalRevenue: number;
  avgRevenuePerTrip: number;
}

export function summarizeTripStats(trips: { travelerCount: number; revenue: number }[]): TripStatsSummary {
  const tripCount = trips.length;
  const totalTravelers = trips.reduce((sum, t) => sum + t.travelerCount, 0);
  const totalRevenue = trips.reduce((sum, t) => sum + t.revenue, 0);
  return {
    tripCount,
    totalTravelers,
    avgTravelersPerTrip: tripCount ? totalTravelers / tripCount : 0,
    totalRevenue,
    avgRevenuePerTrip: tripCount ? totalRevenue / tripCount : 0,
  };
}
