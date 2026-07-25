ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approval_token_unique" UNIQUE("approval_token");