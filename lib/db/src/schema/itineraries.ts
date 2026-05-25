import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";
import { hotelsTable } from "./hotels";

export const itinerariesTable = pgTable("itineraries", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").references(() => agenciesTable.id),
  name: text("name").notNull(),
  countries: text("countries").array().notNull().default([]),
  region: text("region"),
  numDays: integer("num_days").notNull().default(1),
  difficulty: text("difficulty", { enum: ["easy", "moderate", "demanding"] }),
  description: text("description"),
  videoUrl: text("video_url"),
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
  transport: text("transport"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const itineraryDayHotelsTable = pgTable("itinerary_day_hotels", {
  id: serial("id").primaryKey(),
  itineraryDayId: integer("itinerary_day_id").notNull().references(() => itineraryDaysTable.id, { onDelete: "cascade" }),
  hotelId: integer("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  segment: text("segment", { enum: ["basic", "standard", "premium"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertItinerarySchema = createInsertSchema(itinerariesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItineraryDaySchema = createInsertSchema(itineraryDaysTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItineraryDayHotelSchema = createInsertSchema(itineraryDayHotelsTable).omit({ id: true, createdAt: true });

export type InsertItinerary = z.infer<typeof insertItinerarySchema>;
export type Itinerary = typeof itinerariesTable.$inferSelect;
export type InsertItineraryDay = z.infer<typeof insertItineraryDaySchema>;
export type ItineraryDay = typeof itineraryDaysTable.$inferSelect;
export type ItineraryDayHotel = typeof itineraryDayHotelsTable.$inferSelect;
