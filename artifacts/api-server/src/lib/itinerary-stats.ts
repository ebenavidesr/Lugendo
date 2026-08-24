import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { tripsTable, tripSharesTable, itinerariesTable } from "@workspace/db";

// No hay todavía ningún dato de facturación real por viaje/viajero en el schema (ni tabla de
// pagos, ni integración con Stripe). Hasta que exista (#92 — Módulo de facturación), estimamos
// los ingresos con dos reglas distintas según quién mira el dato (decisión de Quique, #172/#174):
// - Admin (visión de plataforma): fee fijo de Lugendo por viajero.
// - Agencia/asesor (manager/agent/advisor, visión de su propio negocio): nº de viajeros del
//   itinerario multiplicado por el precio "desde" (`itineraries.priceFrom`) de ese itinerario.
// TODO: sustituir ambas por dato de facturación real cuando exista.
export const PLACEHOLDER_FEE_PER_TRAVELER_EUR = 10;

export type RevenueMode = "platform-fee" | "itinerary-price";

export function revenueModeForRole(role: string): RevenueMode {
  return role === "admin" ? "platform-fee" : "itinerary-price";
}

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
// ingresos estimados por viaje. Compartido entre el endpoint de estadísticas de un itinerario
// individual (#172) y el de estadísticas agregadas del dashboard (#174) para no duplicar la
// lógica de cálculo.
export async function getTripStatsForItineraries(itineraryIds: number[], revenueMode: RevenueMode): Promise<ItineraryTripStat[]> {
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

  const [travelerCounts, priceFromRows] = await Promise.all([
    db
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
      .groupBy(tripSharesTable.tripId),
    revenueMode === "itinerary-price"
      ? db.select({ id: itinerariesTable.id, priceFrom: itinerariesTable.priceFrom }).from(itinerariesTable).where(inArray(itinerariesTable.id, itineraryIds))
      : Promise.resolve([]),
  ]);
  const countMap = Object.fromEntries(travelerCounts.map(t => [t.tripId, t.count]));
  const priceFromMap = Object.fromEntries(priceFromRows.map(i => [i.id, i.priceFrom ?? 0]));

  return trips.map(t => {
    const travelerCount = countMap[t.id] ?? 0;
    const revenue = revenueMode === "platform-fee"
      ? travelerCount * PLACEHOLDER_FEE_PER_TRAVELER_EUR
      : travelerCount * (t.itineraryId != null ? (priceFromMap[t.itineraryId] ?? 0) : 0);
    return {
      id: t.id,
      itineraryId: t.itineraryId,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      travelerCount,
      revenue,
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
