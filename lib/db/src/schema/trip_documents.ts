import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const tripDocumentsTable = pgTable("trip_documents", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  storageKey: text("storage_key").notNull(),
  // Set by the "Compartir con todos" bulk action: travelers who join the trip *after* this was
  // set are auto-backfilled a trip_document_shares row (see backfillSharedWithAll in the
  // api-server), instead of "share with all" being a one-time snapshot of who was on the trip.
  sharedWithAll: boolean("shared_with_all").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tripDocumentSharesTable = pgTable("trip_document_shares", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => tripDocumentsTable.id, { onDelete: "cascade" }),
  travelerId: integer("traveler_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.documentId, t.travelerId)]);

export const insertTripDocumentSchema = createInsertSchema(tripDocumentsTable).omit({ id: true, createdAt: true });
export const insertTripDocumentShareSchema = createInsertSchema(tripDocumentSharesTable).omit({ id: true, createdAt: true });
export type InsertTripDocument = z.infer<typeof insertTripDocumentSchema>;
export type TripDocument = typeof tripDocumentsTable.$inferSelect;
export type InsertTripDocumentShare = z.infer<typeof insertTripDocumentShareSchema>;
export type TripDocumentShare = typeof tripDocumentSharesTable.$inferSelect;
