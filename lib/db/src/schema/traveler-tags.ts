import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { travelerTagCatalogTable } from "./traveler-tag-catalog";

export const travelerTagsTable = pgTable("traveler_tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => travelerTagCatalogTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.userId, table.tagId),
]);

export const insertTravelerTagSchema = createInsertSchema(travelerTagsTable).omit({ id: true, createdAt: true });
export type InsertTravelerTag = z.infer<typeof insertTravelerTagSchema>;
export type TravelerTag = typeof travelerTagsTable.$inferSelect;
