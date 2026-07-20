import { pgTable, serial, text, boolean, integer, timestamp, jsonb, index, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";
import { itinerariesTable } from "./itineraries";
import { hotelsTable } from "./hotels";
import { activitiesTable } from "./activities";
import { usersTable } from "./users";

export interface FlightLeg {
  airline: string;
  flightNumber: string;
  cityFrom: string;
  cityTo: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  reservationCode: string;
}

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").references(() => agenciesTable.id),
  ownerId: integer("owner_id").references(() => usersTable.id),
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
  returnAirline: text("return_airline"),
  returnFlightNumber: text("return_flight_number"),
  returnFlightTime: text("return_flight_time"),
  returnReservationCode: text("return_reservation_code"),
  description: text("description"),
  outboundFlights: jsonb("outbound_flights").$type<FlightLeg[]>(),
  returnFlights: jsonb("return_flights").$type<FlightLeg[]>(),
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
  // Geocoded lazily (see artifacts/api-server/src/lib/geocoding.ts) when the day is created/edited
  // or the first time the trip's Mapa tab is opened -- null until then, or if geocoding failed.
  cityFromLat: doublePrecision("city_from_lat"),
  cityFromLng: doublePrecision("city_from_lng"),
  cityToLat: doublePrecision("city_to_lat"),
  cityToLng: doublePrecision("city_to_lng"),
  cityFromCountry: text("city_from_country"),
  cityToCountry: text("city_to_country"),
  transport: text("transport"),
  description: text("description"),
  isTransitNight: boolean("is_transit_night").notNull().default(false),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tripDayHotelsTable = pgTable("trip_day_hotels", {
  id: serial("id").primaryKey(),
  tripDayId: integer("trip_day_id").notNull().references(() => tripDaysTable.id, { onDelete: "cascade" }),
  hotelId: integer("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  segment: text("segment", { enum: ["basic", "standard", "premium"] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tripDayActivitiesTable = pgTable("trip_day_activities", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id").notNull().references(() => tripDaysTable.id, { onDelete: "cascade" }),
  activityId: integer("activity_id").references(() => activitiesTable.id, { onDelete: "cascade" }),
  activityTitle: text("activity_title"),
  sortOrder: integer("sort_order").notNull().default(0),
  startTime: text("start_time"),
  endTime: text("end_time"),
  notes: text("notes"),
  companyContact: text("company_contact"),
  addressOverride: text("address_override"),
  included: boolean("included").notNull().default(true),
  transportMode: text("transport_mode"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tda_day_idx").on(t.dayId)]);

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTripDaySchema = createInsertSchema(tripDaysTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTripDayHotelSchema = createInsertSchema(tripDayHotelsTable).omit({ id: true, createdAt: true });
export const insertTripDayActivitySchema = createInsertSchema(tripDayActivitiesTable).omit({ id: true, createdAt: true });

export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
export type InsertTripDay = z.infer<typeof insertTripDaySchema>;
export type TripDay = typeof tripDaysTable.$inferSelect;
export type TripDayHotel = typeof tripDayHotelsTable.$inferSelect;
export type TripDayActivity = typeof tripDayActivitiesTable.$inferSelect;
