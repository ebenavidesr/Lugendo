import { pgTable, serial, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";
import { hotelsTable } from "./hotels";
import { activitiesTable } from "./activities";
import { usersTable } from "./users";

export const itinerariesTable = pgTable("itineraries", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").references(() => agenciesTable.id),
  createdBy: integer("created_by").references(() => usersTable.id),
  name: text("name").notNull(),
  countries: text("countries").array().notNull().default([]),
  region: text("region"),
  numDays: integer("num_days").notNull().default(1),
  difficulty: text("difficulty", { enum: ["easy", "moderate", "demanding"] }),
  description: text("description"),
  videoUrl: text("video_url"),
  recommendedMonths: text("recommended_months").array().notNull().default([]),
  priceRange: text("price_range"),
  tags: text("tags").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itineraryDaysTable = pgTable("itinerary_days", {
  id: serial("id").primaryKey(),
  itineraryId: integer("itinerary_id").notNull().references(() => itinerariesTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  cityFrom: text("city_from"),
  cityTo: text("city_to"),
  country: text("country"),
  transport: text("transport"),
  description: text("description"),
  isTransitNight: boolean("is_transit_night").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itineraryDayHotelsTable = pgTable("itinerary_day_hotels", {
  id: serial("id").primaryKey(),
  itineraryDayId: integer("itinerary_day_id").notNull().references(() => itineraryDaysTable.id, { onDelete: "cascade" }),
  hotelId: integer("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  segment: text("segment", { enum: ["basic", "standard", "premium"] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itineraryDayActivitiesTable = pgTable("itinerary_day_activities", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id").notNull().references(() => itineraryDaysTable.id, { onDelete: "cascade" }),
  activityId: integer("activity_id").notNull().references(() => activitiesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  startTime: text("start_time"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ida_day_idx").on(t.dayId)]);

export const insertItinerarySchema = createInsertSchema(itinerariesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItineraryDaySchema = createInsertSchema(itineraryDaysTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItineraryDayHotelSchema = createInsertSchema(itineraryDayHotelsTable).omit({ id: true, createdAt: true });

export type InsertItinerary = z.infer<typeof insertItinerarySchema>;
export type Itinerary = typeof itinerariesTable.$inferSelect;
export type InsertItineraryDay = z.infer<typeof insertItineraryDaySchema>;
export type ItineraryDay = typeof itineraryDaysTable.$inferSelect;
export type ItineraryDayHotel = typeof itineraryDayHotelsTable.$inferSelect;
