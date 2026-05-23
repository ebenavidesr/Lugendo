import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const tripSharesTable = pgTable("trip_shares", {
  id:               serial("id").primaryKey(),
  tripId:           integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  ownerId:          integer("owner_id").notNull().references(() => usersTable.id),
  sharedWithEmail:  text("shared_with_email").notNull(),
  sharedWithUserId: integer("shared_with_user_id").references(() => usersTable.id),
  shareCode:        text("share_code").notNull().unique(),
  permission:       text("permission", { enum: ["full", "read"] }).notNull().default("read"),
  status:           text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TripShare = typeof tripSharesTable.$inferSelect;
