import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { tripsTable } from "./trips";
import { usersTable } from "./users";

export const tripSharesTable = pgTable("trip_shares", {
  id:               serial("id").primaryKey(),
  tripId:           integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  ownerId:          integer("owner_id").notNull().references(() => usersTable.id),
  sharedWithEmail:  text("shared_with_email").notNull(),
  sharedWithUserId: integer("shared_with_user_id").references(() => usersTable.id),
  // Long single-use token (task #161) — column kept as "share_code" to avoid a destructive
  // rename; only the values it stores changed from short human-typed codes to opaque tokens.
  inviteToken:      text("share_code").notNull().unique(),
  // Only set for a "cold" invite (recipient has no account yet, task #161) — null means the
  // share was accepted instantly at creation (recipient already had an account) or predates
  // the token-expiry system, and never expires.
  tokenExpiresAt:   timestamp("token_expires_at", { withTimezone: true }),
  permission:       text("permission", { enum: ["full", "read"] }).notNull().default("read"),
  // "member": a real co-traveler on this personal trip — classified programado/realizado
  // by dates, like the owner. "guest": view-only inspiration access — always classified
  // "compartido" and forced to read-only permission, regardless of what's requested.
  memberType:       text("member_type", { enum: ["member", "guest"] }).notNull().default("guest"),
  // "agency": the trip's agency invited an official traveler (replaces the old `invitations`
  // table, task #161) — always paired with memberType "member". "traveler": a traveler shared
  // their own personal trip with someone else (task #141).
  origin:           text("origin", { enum: ["agency", "traveler"] }).notNull().default("traveler"),
  segment:          text("segment", { enum: ["basic", "standard", "premium"] }),
  status:           text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt:       timestamp("accepted_at", { withTimezone: true }),
});

export type TripShare = typeof tripSharesTable.$inferSelect;
