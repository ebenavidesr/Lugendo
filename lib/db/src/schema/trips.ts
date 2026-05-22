import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";
import { itinerariesTable } from "./itineraries";
import { hotelsTable } from "./hotels";
import { usersTable } from "./users";

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agenciesTable.id),
  itineraryId: integer("itinerary_id").references(() => itinerariesTable.id),
  name: text("name").notNull(),
  status: text("status", { enum: ["draft", "scheduled", "active", "finished", "cancelled"] }).notNull().default("draft"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  maxCapacity: integer("max_capacity"),
  airline: text("airline"),
  flightNumber: text("flight_number"),
  flightTime: text("flight_time"),
  reservationCode: text("reservation_code"),
  flightNotes: text("flight_notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tripDaysTable = pgTable("trip_days", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  cityFrom: text("city_from"),
  cityTo: text("city_to"),
  transport: text("transport"),
  description: text("description"),
  hotelId: integer("hotel_id").references(() => hotelsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTripDaySchema = createInsertSchema(tripDaysTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
export type InsertTripDay = z.infer<typeof insertTripDaySchema>;
export type TripDay = typeof tripDaysTable.$inferSelect;
