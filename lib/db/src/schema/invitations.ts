import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const invitationsTable = pgTable("invitations", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  status: text("status", { enum: ["pending", "accepted", "declined"] }).notNull().default("pending"),
  travelerId: integer("traveler_id").references(() => usersTable.id),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const insertInvitationSchema = createInsertSchema(invitationsTable).omit({ id: true, createdAt: true });
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitationsTable.$inferSelect;
