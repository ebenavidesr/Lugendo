import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
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
  // Set by the "Compartir con todos" bulk action: travelers who join the trip *after* this was
  // set are auto-backfilled a trip_note_shares row (see backfillSharedWithAll in the api-server),
  // instead of "share with all" being a one-time snapshot of whoever was on the trip at the time.
  sharedWithAll: boolean("shared_with_all").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tripNoteSharesTable = pgTable("trip_note_shares", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => tripNotesTable.id, { onDelete: "cascade" }),
  travelerId: integer("traveler_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.noteId, t.travelerId)]);

export const insertTripNoteSchema = createInsertSchema(tripNotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTripNoteShareSchema = createInsertSchema(tripNoteSharesTable).omit({ id: true, createdAt: true });
export type InsertTripNote = z.infer<typeof insertTripNoteSchema>;
export type TripNote = typeof tripNotesTable.$inferSelect;
export type InsertTripNoteShare = z.infer<typeof insertTripNoteShareSchema>;
export type TripNoteShare = typeof tripNoteSharesTable.$inferSelect;
