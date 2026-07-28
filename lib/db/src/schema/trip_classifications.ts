import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tripsTable } from "./trips";

export const tripClassificationsTable = pgTable("trip_classifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  classification: text("classification", { enum: ["programado", "realizado", "compartido"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique().on(table.userId, table.tripId),
]);

export const insertTripClassificationSchema = createInsertSchema(tripClassificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTripClassification = z.infer<typeof insertTripClassificationSchema>;
export type TripClassification = typeof tripClassificationsTable.$inferSelect;
export type TripClassificationValue = TripClassification["classification"];
