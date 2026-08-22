import { and, eq, isNull } from "drizzle-orm";
import { db, tripSharesTable } from "@workspace/db";
import { ensureTripClassification, ensureTripClassificationByDates } from "./trip-classification";
import { backfillSharedWithAll } from "./shared-with-all-backfill";

// Links every pending trip_shares row for this email to the account that just registered
// (email verified) or just logged in (task #161). Replaces the old two separate "accept by
// code" flows (invitations + trip_shares): invites no longer need a manual accept click --
// an already-registered recipient is linked instantly at invite creation, and a brand-new
// recipient is linked here as soon as their email is verified. Called again on every login
// as a safety net for edge cases (e.g. an account created through another path).
export async function resolvePendingTripSharesForUser(userId: number, email: string): Promise<void> {
  const pending = await db
    .select()
    .from(tripSharesTable)
    .where(and(
      eq(tripSharesTable.sharedWithEmail, email.toLowerCase().trim()),
      eq(tripSharesTable.status, "pending"),
      isNull(tripSharesTable.sharedWithUserId),
    ));

  for (const share of pending) {
    if (share.tokenExpiresAt && share.tokenExpiresAt.getTime() < Date.now()) continue;

    await db
      .update(tripSharesTable)
      .set({ status: "accepted", sharedWithUserId: userId, acceptedAt: new Date() })
      .where(eq(tripSharesTable.id, share.id));

    // A "guest" share always defaults to "compartido" (task #140); a "member" share (agency
    // invite or task #141 Miembro) is a real co-traveler, classified by dates like the owner.
    if (share.memberType === "member") {
      await ensureTripClassificationByDates(userId, share.tripId);
      await backfillSharedWithAll(share.tripId, userId);
    } else {
      await ensureTripClassification(userId, share.tripId, "compartido");
    }
  }
}
