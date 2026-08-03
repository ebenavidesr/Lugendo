import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Shareable traveler profile (#155). One row per traveler, created lazily on first write.
// The three visibility switches and the agency consent switch all default to false --
// privacy-first: every block is opt-in, nothing is shared until the traveler turns it on.
export const travelerProfilesTable = pgTable("traveler_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  // "/objects/{uuid}" key into private R2 storage, resolved through an authenticated
  // streaming route that re-checks profile access on every request -- never a public URL.
  avatarStorageKey: text("avatar_storage_key"),
  showVisitedCountries: boolean("show_visited_countries").notNull().default(false),
  showWantedCountries: boolean("show_wanted_countries").notNull().default(false),
  showTags: boolean("show_tags").notNull().default(false),
  // Separate from the three profile switches above: this one gates visibility to the
  // traveler's own agency back office (admin/manager/agent/local guide), not to companions.
  agencyTagsConsent: boolean("agency_tags_consent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTravelerProfileSchema = createInsertSchema(travelerProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTravelerProfile = z.infer<typeof insertTravelerProfileSchema>;
export type TravelerProfile = typeof travelerProfilesTable.$inferSelect;
