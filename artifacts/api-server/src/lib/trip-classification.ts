import { eq, and } from "drizzle-orm";
import { db, tripClassificationsTable, tripsTable, type TripClassificationValue } from "@workspace/db";

// Default classification for a trip the user owns or was invited to by an agency:
// past trips (retroactive entries included) default to "realizado", everything
// else defaults to "programado". The user can always override this manually.
export function defaultDateBasedClassification(startDate: string, endDate: string | null): "programado" | "realizado" {
  const today = new Date().toISOString().slice(0, 10);
  const reference = endDate ?? startDate;
  return reference < today ? "realizado" : "programado";
}

export async function ensureTripClassification(userId: number, tripId: number, classification: TripClassificationValue): Promise<void> {
  await db
    .insert(tripClassificationsTable)
    .values({ userId, tripId, classification })
    .onConflictDoNothing({ target: [tripClassificationsTable.userId, tripClassificationsTable.tripId] });
}

// Convenience for the "own trip" / "agency invitation" access paths, where the
// default is derived from the trip's dates rather than being fixed (unlike shares,
// which always default to "compartido" — see task #140 decisions).
export async function ensureTripClassificationByDates(userId: number, tripId: number): Promise<void> {
  const [trip] = await db
    .select({ startDate: tripsTable.startDate, endDate: tripsTable.endDate })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  if (!trip) return;
  await ensureTripClassification(userId, tripId, defaultDateBasedClassification(trip.startDate, trip.endDate));
}

export async function getTripClassification(userId: number, tripId: number): Promise<TripClassificationValue | null> {
  const [row] = await db
    .select({ classification: tripClassificationsTable.classification })
    .from(tripClassificationsTable)
    .where(and(eq(tripClassificationsTable.userId, userId), eq(tripClassificationsTable.tripId, tripId)));
  return row?.classification ?? null;
}
