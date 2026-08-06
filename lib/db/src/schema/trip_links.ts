import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

// "Enlaces" -- new, independent feature that reuses trip_documents' ownership/visibility
// pattern exactly (see trip_documents.ts): agency-authored rows (role resolved via a join to
// users.role at query time, not stored here) are visible to every trip member; a traveler's own
// link is private unless explicitly shared via trip_link_shares.
export const tripLinksTable = pgTable("trip_links", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tripLinkSharesTable = pgTable("trip_link_shares", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").notNull().references(() => tripLinksTable.id, { onDelete: "cascade" }),
  travelerId: integer("traveler_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.linkId, t.travelerId)]);

export const insertTripLinkSchema = createInsertSchema(tripLinksTable).omit({ id: true, createdAt: true });
export const insertTripLinkShareSchema = createInsertSchema(tripLinkSharesTable).omit({ id: true, createdAt: true });
export type InsertTripLink = z.infer<typeof insertTripLinkSchema>;
export type TripLink = typeof tripLinksTable.$inferSelect;
export type InsertTripLinkShare = z.infer<typeof insertTripLinkShareSchema>;
export type TripLinkShare = typeof tripLinkSharesTable.$inferSelect;
