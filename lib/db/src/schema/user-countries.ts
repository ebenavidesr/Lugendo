import { pgTable, serial, text, varchar, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userCountriesTable = pgTable("user_countries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  status: text("status", { enum: ["visitado", "objetivo"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique().on(table.userId, table.countryCode),
]);

export const insertUserCountrySchema = createInsertSchema(userCountriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserCountry = z.infer<typeof insertUserCountrySchema>;
export type UserCountry = typeof userCountriesTable.$inferSelect;
