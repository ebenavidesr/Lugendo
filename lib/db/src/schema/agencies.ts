import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agenciesTable = pgTable("agencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  // Uploaded logo file (PNG/JPG/SVG/WebP), stored as a ready-to-render public URL served from
  // R2 via GET /storage/public-objects/*. Takes priority over logoUrl when present; logoUrl
  // stays as the fallback for agencies that only ever set an external URL.
  logoFileUrl: text("logo_file_url"),
  primaryColor: text("primary_color"),
  writingTone: text("writing_tone", {
    enum: ["informative", "friendly", "adventurous", "luxury", "professional"],
  }).notNull().default("friendly"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgencySchema = createInsertSchema(agenciesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Agency = typeof agenciesTable.$inferSelect;
