import { and, eq, ne, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripNotesTable, tripNoteSharesTable,
  tripDocumentsTable, tripDocumentSharesTable,
  tripLinksTable, tripLinkSharesTable,
  tripDayActivitiesTable, tripDayActivityParticipantsTable,
  tripDaysTable,
} from "@workspace/db";

// "Compartir con todos" is no longer a one-time snapshot of whoever happened to be a trip member
// when the button was clicked -- items flagged sharedWithAll auto-include travelers who join the
// trip afterwards too. Call this whenever a traveler gains trip access (accepting an agency
// invitation, or accepting a "member" trip_shares) -- never for guests, who are already excluded
// from listTripMembers and every participant/share picker in the app.
export async function backfillSharedWithAll(tripId: number, newTravelerId: number): Promise<void> {
  const notes = await db.select({ id: tripNotesTable.id })
    .from(tripNotesTable)
    .where(and(
      eq(tripNotesTable.tripId, tripId),
      eq(tripNotesTable.sharedWithAll, true),
      ne(tripNotesTable.userId, newTravelerId),
    ));
  if (notes.length > 0) {
    await db.insert(tripNoteSharesTable)
      .values(notes.map(n => ({ noteId: n.id, travelerId: newTravelerId })))
      .onConflictDoNothing();
  }

  const docs = await db.select({ id: tripDocumentsTable.id })
    .from(tripDocumentsTable)
    .where(and(
      eq(tripDocumentsTable.tripId, tripId),
      eq(tripDocumentsTable.sharedWithAll, true),
      ne(tripDocumentsTable.userId, newTravelerId),
    ));
  if (docs.length > 0) {
    await db.insert(tripDocumentSharesTable)
      .values(docs.map(d => ({ documentId: d.id, travelerId: newTravelerId })))
      .onConflictDoNothing();
  }

  const links = await db.select({ id: tripLinksTable.id })
    .from(tripLinksTable)
    .where(and(
      eq(tripLinksTable.tripId, tripId),
      eq(tripLinksTable.sharedWithAll, true),
      ne(tripLinksTable.userId, newTravelerId),
    ));
  if (links.length > 0) {
    await db.insert(tripLinkSharesTable)
      .values(links.map(l => ({ linkId: l.id, travelerId: newTravelerId })))
      .onConflictDoNothing();
  }

  const activities = await db.select({ id: tripDayActivitiesTable.id })
    .from(tripDayActivitiesTable)
    .innerJoin(tripDaysTable, eq(tripDayActivitiesTable.dayId, tripDaysTable.id))
    .where(and(
      eq(tripDaysTable.tripId, tripId),
      eq(tripDayActivitiesTable.sharedWithAll, true),
      isNotNull(tripDayActivitiesTable.createdByUserId),
      ne(tripDayActivitiesTable.createdByUserId, newTravelerId),
    ));
  if (activities.length > 0) {
    await db.insert(tripDayActivityParticipantsTable)
      .values(activities.map(a => ({ activityLinkId: a.id, travelerId: newTravelerId })))
      .onConflictDoNothing();
  }
}
