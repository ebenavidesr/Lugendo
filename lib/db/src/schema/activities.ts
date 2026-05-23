import { pgTable, serial, text, boolean, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";

export const activitiesTable = pgTable("activities", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agenciesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category", {
    enum: ["cultural", "gastronomic", "adventure", "nature", "beach", "city", "excursion", "other"],
  }),
  durationHours: numeric("duration_hours", { precision: 5, scale: 1 }),
  city: text("city"),
  country: text("country"),
  pricePerPerson: numeric("price_per_person", { precision: 10, scale: 2 }),
  minPax: integer("min_pax"),
  maxPax: integer("max_pax"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
