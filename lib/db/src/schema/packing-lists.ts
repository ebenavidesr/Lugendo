import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const tripPackingItemsTable = pgTable("trip_packing_items", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category", {
    enum: ["ropa", "higiene", "documentos", "electronica", "actividades", "otros"],
  }).notNull(),
  packed: boolean("packed").notNull().default(false),
  origin: text("origin", { enum: ["suggested", "personal"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTripPackingItemSchema = createInsertSchema(tripPackingItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTripPackingItem = z.infer<typeof insertTripPackingItemSchema>;
export type TripPackingItem = typeof tripPackingItemsTable.$inferSelect;
