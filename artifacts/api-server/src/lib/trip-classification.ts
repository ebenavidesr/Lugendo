import { eq, and, sql } from "drizzle-orm";
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
//
// Unlike ensureTripClassification, this upserts: official agency membership must be
// able to correct a "compartido" row left over from an earlier share-accept for the
// same (userId, tripId) pair (task #140 bug). It never overwrites an existing
// "programado"/"realizado" — official membership is never downgraded by anything.
export async function ensureTripClassificationByDates(userId: number, tripId: number): Promise<void> {
  const [trip] = await db
    .select({ startDate: tripsTable.startDate, endDate: tripsTable.endDate })
    .from(tripsTable)
    .where(eq(tripsTable.id, tripId));
  if (!trip) return;
  const classification = defaultDateBasedClassification(trip.startDate, trip.endDate);
  await db
    .insert(tripClassificationsTable)
    .values({ userId, tripId, classification })
    .onConflictDoUpdate({
      target: [tripClassificationsTable.userId, tripClassificationsTable.tripId],
      set: { classification, updatedAt: new Date() },
      setWhere: sql`${tripClassificationsTable.classification} = 'compartido'`,
    });
}

export async function getTripClassification(userId: number, tripId: number): Promise<TripClassificationValue | null> {
  const [row] = await db
    .select({ classification: tripClassificationsTable.classification })
    .from(tripClassificationsTable)
    .where(and(eq(tripClassificationsTable.userId, userId), eq(tripClassificationsTable.tripId, tripId)));
  return row?.classification ?? null;
}
