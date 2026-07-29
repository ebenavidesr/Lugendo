import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "manager", "agent", "traveler"] }).notNull().default("traveler"),
  agencyId: integer("agency_id").references(() => agenciesTable.id),
  active: boolean("active").notNull().default(true),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("approved"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  approvalToken: text("approval_token").unique(),
  // Defaults to true so existing rows (created before this column existed) are grandfathered
  // in as verified — only new registrations are created with this explicitly set to false.
  emailVerified: boolean("email_verified").notNull().default(true),
  emailVerificationToken: text("email_verification_token").unique(),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
  passwordResetToken: text("password_reset_token").unique(),
  passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
