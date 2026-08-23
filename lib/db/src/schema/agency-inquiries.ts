import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";
import { itinerariesTable } from "./itineraries";
import { usersTable } from "./users";

// Tarea #163: consulta puntual de un viajero con sesión a una agencia concreta, opcionalmente
// referida a un itinerario del catálogo público. agencyId se guarda aparte del itinerario (no
// se deriva por JOIN) para que la consulta siga apuntando a la agencia correcta aunque el
// itinerario cambie de dueño o se borre más adelante.
export const agencyInquiriesTable = pgTable("agency_inquiries", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agenciesTable.id, { onDelete: "cascade" }),
  itineraryId: integer("itinerary_id").references(() => itinerariesTable.id, { onDelete: "set null" }),
  travelerId: integer("traveler_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  status: text("status", { enum: ["pending", "read"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgencyInquirySchema = createInsertSchema(agencyInquiriesTable).omit({ id: true, createdAt: true });
export type InsertAgencyInquiry = z.infer<typeof insertAgencyInquirySchema>;
export type AgencyInquiry = typeof agencyInquiriesTable.$inferSelect;
