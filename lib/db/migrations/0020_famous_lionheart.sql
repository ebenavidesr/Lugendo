CREATE TABLE "email_send_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"recipient_email" text NOT NULL,
	"related_trip_id" integer,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_send_log" ADD CONSTRAINT "email_send_log_related_trip_id_trips_id_fk" FOREIGN KEY ("related_trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_verification_token_unique" UNIQUE("email_verification_token");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_password_reset_token_unique" UNIQUE("password_reset_token");