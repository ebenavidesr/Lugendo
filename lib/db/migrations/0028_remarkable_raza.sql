DROP TABLE "invitations" CASCADE;--> statement-breakpoint
ALTER TABLE "trip_shares" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_shares" ADD COLUMN "origin" text DEFAULT 'traveler' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_shares" ADD COLUMN "segment" text;--> statement-breakpoint
ALTER TABLE "trip_shares" ADD COLUMN "accepted_at" timestamp with time zone;