ALTER TABLE "agencies" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "public_profile_enabled" boolean DEFAULT false NOT NULL;