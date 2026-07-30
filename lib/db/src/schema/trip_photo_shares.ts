import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export interface TripPhotoSnapshotDay {
  dayNumber: number;
  cityFrom: string | null;
  cityTo: string | null;
  hotels: Array<{ name: string; address: string | null; phone: string | null; website: string | null }>;
  activities: Array<{ name: string; description: string | null; startTime: string | null; endTime: string | null }>;
}

export interface TripPhotoSnapshot {
  tripName: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
  days: TripPhotoSnapshotDay[];
}

// A frozen, public, read-only copy of a trip's itinerary — task #141. Unlike
// trip_shares (a live link to the real trip, for another registered traveler),
// this has no FK to a recipient: the snapshot is self-contained JSON so an
// external contact ("Invitada") can view it via shareCode without an account.
export const tripPhotoSharesTable = pgTable("trip_photo_shares", {
  id:        serial("id").primaryKey(),
  tripId:    integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  ownerId:   integer("owner_id").notNull().references(() => usersTable.id),
  shareCode: text("share_code").notNull().unique(),
  snapshot:  jsonb("snapshot").notNull().$type<TripPhotoSnapshot>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TripPhotoShare = typeof tripPhotoSharesTable.$inferSelect;
