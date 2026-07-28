import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, tripNotesTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DayTable = "itinerary_days" | "trip_days";
type ScopeColumn = "itinerary_id" | "trip_id";

export type DayNumberMapping = { oldNumber: number; newNumber: number };

/**
 * After a day is deleted, closes the resulting gap so day_number stays a
 * contiguous 1..N sequence (no holes) for the remaining days in scope.
 */
export async function closeDayGap(
  tx: Tx,
  table: DayTable,
  scopeColumn: ScopeColumn,
  scopeId: number,
  removedDayNumber: number,
): Promise<void> {
  await tx.execute(sql`
    UPDATE ${sql.raw(table)}
    SET day_number = day_number - 1
    WHERE ${sql.raw(scopeColumn)} = ${scopeId} AND day_number > ${removedDayNumber}
  `);
}

/**
 * Moves a day to a new day_number, shifting the days in between by ±1 so the
 * sequence stays contiguous. Returns the old→new day_number mapping for every
 * row touched (including the moved day itself) so callers can mirror the same
 * shift onto other day-number references (e.g. trip notes).
 */
export async function repositionDay(
  tx: Tx,
  table: DayTable,
  scopeColumn: ScopeColumn,
  scopeId: number,
  dayRowId: number,
  oldNumber: number,
  newNumber: number,
): Promise<DayNumberMapping[]> {
  if (oldNumber === newNumber) return [];

  const mapping: DayNumberMapping[] = [{ oldNumber, newNumber }];

  const shifted = newNumber > oldNumber
    ? await tx.execute(sql`
        UPDATE ${sql.raw(table)} SET day_number = day_number - 1
        WHERE ${sql.raw(scopeColumn)} = ${scopeId} AND day_number > ${oldNumber} AND day_number <= ${newNumber} AND id != ${dayRowId}
        RETURNING day_number
      `)
    : await tx.execute(sql`
        UPDATE ${sql.raw(table)} SET day_number = day_number + 1
        WHERE ${sql.raw(scopeColumn)} = ${scopeId} AND day_number >= ${newNumber} AND day_number < ${oldNumber} AND id != ${dayRowId}
        RETURNING day_number
      `);

  for (const row of shifted.rows as { day_number: number }[]) {
    const shiftedNewNumber = row.day_number;
    const shiftedOldNumber = newNumber > oldNumber ? shiftedNewNumber + 1 : shiftedNewNumber - 1;
    mapping.push({ oldNumber: shiftedOldNumber, newNumber: shiftedNewNumber });
  }

  await tx.execute(sql`
    UPDATE ${sql.raw(table)} SET day_number = ${newNumber} WHERE id = ${dayRowId}
  `);

  return mapping;
}

/**
 * Mirrors a day removal onto trip_notes.dayNumber/endDayNumber: values after the
 * removed day shift down by one. A single-day note anchored exactly on the removed
 * day (no endDayNumber) is detached (dayNumber set to null) rather than silently
 * reassigned to a different day — best-effort, documented behavior.
 */
export async function shiftTripNotesForDayRemoval(tx: Tx, tripId: number, removedDayNumber: number): Promise<void> {
  await tx.update(tripNotesTable)
    .set({ dayNumber: null })
    .where(and(
      eq(tripNotesTable.tripId, tripId),
      eq(tripNotesTable.dayNumber, removedDayNumber),
      isNull(tripNotesTable.endDayNumber),
    ));

  await tx.execute(sql`
    UPDATE trip_notes SET day_number = day_number - 1
    WHERE trip_id = ${tripId} AND day_number > ${removedDayNumber}
  `);
  await tx.execute(sql`
    UPDATE trip_notes SET end_day_number = end_day_number - 1
    WHERE trip_id = ${tripId} AND end_day_number > ${removedDayNumber}
  `);
}

/**
 * Mirrors a day reposition onto trip_notes.dayNumber/endDayNumber using the same
 * old→new mapping returned by repositionDay, so notes stay anchored to the same
 * physical day even as its number changes.
 */
export async function shiftTripNotesForReposition(tx: Tx, tripId: number, mapping: DayNumberMapping[]): Promise<void> {
  const changed = mapping.filter(m => m.oldNumber !== m.newNumber);
  if (changed.length === 0) return;

  const lookup = new Map(changed.map(m => [m.oldNumber, m.newNumber]));
  const oldNumbers = changed.map(m => m.oldNumber);

  // Snapshot affected rows by their pre-reposition values first. Applying the mapping
  // one entry at a time via "WHERE day_number = oldNumber" corrupts data when the
  // mapping is a permutation cycle (e.g. 2→4, 4→3): a row already moved to 4 by the
  // first step would be wrongly caught by the later 4→3 step.
  const affected = await tx.select({ id: tripNotesTable.id, dayNumber: tripNotesTable.dayNumber, endDayNumber: tripNotesTable.endDayNumber })
    .from(tripNotesTable)
    .where(and(
      eq(tripNotesTable.tripId, tripId),
      or(
        inArray(tripNotesTable.dayNumber, oldNumbers),
        inArray(tripNotesTable.endDayNumber, oldNumbers),
      ),
    ));

  for (const row of affected) {
    const newDayNumber = row.dayNumber != null ? lookup.get(row.dayNumber) ?? row.dayNumber : row.dayNumber;
    const newEndDayNumber = row.endDayNumber != null ? lookup.get(row.endDayNumber) ?? row.endDayNumber : row.endDayNumber;
    if (newDayNumber === row.dayNumber && newEndDayNumber === row.endDayNumber) continue;
    await tx.update(tripNotesTable)
      .set({ dayNumber: newDayNumber, endDayNumber: newEndDayNumber })
      .where(eq(tripNotesTable.id, row.id));
  }
}
