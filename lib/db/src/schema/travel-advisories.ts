import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const countryAdvisoriesTable = pgTable("country_advisories", {
  id: serial("id").primaryKey(),
  countryName: text("country_name").notNull().unique(),
  sourceUrl: text("source_url").notNull(),
  contentText: text("content_text"),
  contentHash: text("content_hash"),
  officialUpdatedAt: text("official_updated_at"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tripAdvisoryViewsTable = pgTable("trip_advisory_views", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  countryName: text("country_name").notNull(),
  seenHash: text("seen_hash"),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.tripId, table.userId, table.countryName),
]);

export const insertCountryAdvisorySchema = createInsertSchema(countryAdvisoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCountryAdvisory = z.infer<typeof insertCountryAdvisorySchema>;
export type CountryAdvisory = typeof countryAdvisoriesTable.$inferSelect;

export const insertTripAdvisoryViewSchema = createInsertSchema(tripAdvisoryViewsTable).omit({ id: true, seenAt: true });
export type InsertTripAdvisoryView = z.infer<typeof insertTripAdvisoryViewSchema>;
export type TripAdvisoryView = typeof tripAdvisoryViewsTable.$inferSelect;
