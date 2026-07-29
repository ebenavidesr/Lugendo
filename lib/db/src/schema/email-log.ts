import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const emailSendLogTable = pgTable("email_send_log", {
  id: serial("id").primaryKey(),
  type: text("type", {
    enum: [
      "welcome_verification",
      "trip_updated",
      "password_reset",
      "trip_invitation",
      "trip_reminder_7d",
      "trip_reminder_3d",
      "agency_onboarding",
      "document_uploaded",
      "approval_request",
      "trip_share_invitation",
    ],
  }).notNull(),
  recipientEmail: text("recipient_email").notNull(),
  relatedTripId: integer("related_trip_id").references(() => tripsTable.id, { onDelete: "set null" }),
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmailSendLogSchema = createInsertSchema(emailSendLogTable).omit({ id: true, createdAt: true });
export type InsertEmailSendLog = z.infer<typeof insertEmailSendLogSchema>;
export type EmailSendLog = typeof emailSendLogTable.$inferSelect;
