import { and, eq, inArray } from "drizzle-orm";
import {
  db, tripsTable, invitationsTable, usersTable,
  tripChecklistItemsTable, tripPackingItemsTable, emailSendLogTable,
} from "@workspace/db";
import { logger } from "./logger";
import { sendTripReminderEmail } from "./email";
import { PUBLIC_APP_URL } from "./publicUrl";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly, matches the travel-advisory-refresh cadence

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sendRemindersForMilestone(daysUntil: 7 | 3, targetDateISO: string): Promise<void> {
  const type = daysUntil === 7 ? "trip_reminder_7d" : "trip_reminder_3d";

  const trips = await db
    .select({ id: tripsTable.id, name: tripsTable.name })
    .from(tripsTable)
    .where(and(inArray(tripsTable.status, ["scheduled", "active"]), eq(tripsTable.startDate, targetDateISO)));

  if (trips.length === 0) return;
  const tripIds = trips.map(t => t.id);

  const accepted = await db
    .select({ tripId: invitationsTable.tripId, email: invitationsTable.email, travelerId: invitationsTable.travelerId, name: usersTable.name })
    .from(invitationsTable)
    .leftJoin(usersTable, eq(usersTable.id, invitationsTable.travelerId))
    .where(and(inArray(invitationsTable.tripId, tripIds), eq(invitationsTable.status, "accepted")));

  if (accepted.length === 0) return;

  // Idempotency: skip any (trip, recipient) pair that already has a log row for this
  // milestone, so a restart or an extra hourly tick never double-sends the same reminder.
  const alreadySent = await db
    .select({ relatedTripId: emailSendLogTable.relatedTripId, recipientEmail: emailSendLogTable.recipientEmail })
    .from(emailSendLogTable)
    .where(and(eq(emailSendLogTable.type, type), inArray(emailSendLogTable.relatedTripId, tripIds)));
  const alreadySentKeys = new Set(alreadySent.map(r => `${r.relatedTripId}:${r.recipientEmail}`));

  const tripById = new Map(trips.map(t => [t.id, t]));

  for (const traveler of accepted) {
    if (traveler.tripId == null || traveler.travelerId == null) continue;
    const key = `${traveler.tripId}:${traveler.email}`;
    if (alreadySentKeys.has(key)) continue;

    const trip = tripById.get(traveler.tripId);
    if (!trip) continue;

    const [pendingChecklist, pendingPacking] = await Promise.all([
      db
        .select({ title: tripChecklistItemsTable.title })
        .from(tripChecklistItemsTable)
        .where(and(
          eq(tripChecklistItemsTable.tripId, traveler.tripId),
          eq(tripChecklistItemsTable.userId, traveler.travelerId),
          eq(tripChecklistItemsTable.completed, false),
        )),
      db
        .select({ title: tripPackingItemsTable.title })
        .from(tripPackingItemsTable)
        .where(and(
          eq(tripPackingItemsTable.tripId, traveler.tripId),
          eq(tripPackingItemsTable.userId, traveler.travelerId),
          eq(tripPackingItemsTable.packed, false),
        )),
    ]);

    const pendingItems = [
      ...pendingChecklist.map(i => `Checklist: ${i.title}`),
      ...pendingPacking.map(i => `Equipaje: ${i.title}`),
    ];

    try {
      await sendTripReminderEmail({
        to: traveler.email,
        name: traveler.name ?? "viajero",
        tripName: trip.name,
        daysUntil,
        pendingItems,
        tripUrl: `${PUBLIC_APP_URL}/#/traveler/trips/${traveler.tripId}`,
        tripId: traveler.tripId,
      });
    } catch (err) {
      logger.error({ err, tripId: traveler.tripId, to: traveler.email }, "Failed to send trip reminder email");
      // sendEmail() already logged the failure to email_send_log; move on to the next traveler.
    }
  }
}

export async function runDueTripReminders(): Promise<void> {
  try {
    await sendRemindersForMilestone(7, addDaysISO(7));
    await sendRemindersForMilestone(3, addDaysISO(3));
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "trip reminder run failed");
  }
}

export function scheduleTripReminders(): void {
  void runDueTripReminders();
  setInterval(() => { void runDueTripReminders(); }, CHECK_INTERVAL_MS);
}
