import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const tripNotesTable = pgTable("trip_notes", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number"),
  // Optional range end (inclusive). Null means the note applies only to dayNumber (or to no
  // specific day at all, when dayNumber is also null) -- single-day behavior is unchanged.
  endDayNumber: integer("end_day_number"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTripNoteSchema = createInsertSchema(tripNotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTripNote = z.infer<typeof insertTripNoteSchema>;
export type TripNote = typeof tripNotesTable.$inferSelect;
