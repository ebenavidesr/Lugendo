import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Closed catalog (#155): no free-text tags. Two independent axes -- "estilo" (max 2 per
// traveler) and "intereses" (max 8 per traveler), enforced in the backend, not just the form.
// "family" only groups "intereses" rows for the selector's visual layout; it carries no
// meaning in the data model itself (there's no familyTable, no FK) and is null for "estilo".
export const travelerTagCatalogTable = pgTable("traveler_tag_catalog", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  axis: text("axis", { enum: ["estilo", "intereses"] }).notNull(),
  family: text("family", { enum: ["naturaleza", "cultura", "ciudad", "personal"] }),
  label: text("label").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTravelerTagCatalogSchema = createInsertSchema(travelerTagCatalogTable).omit({ id: true, createdAt: true });
export type InsertTravelerTagCatalog = z.infer<typeof insertTravelerTagCatalogSchema>;
export type TravelerTagCatalogEntry = typeof travelerTagCatalogTable.$inferSelect;
