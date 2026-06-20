-- Safe, idempotent migration: adds all columns introduced after the initial production
-- deployment. Uses ADD COLUMN IF NOT EXISTS so it is a no-op on any database that
-- already has these columns (e.g. a fresh DB where the baseline created them).

ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN IF NOT EXISTS "activity_title" text;
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN IF NOT EXISTS "end_time" text;
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN IF NOT EXISTS "company_contact" text;
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN IF NOT EXISTS "address_override" text;
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN IF NOT EXISTS "included" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN IF NOT EXISTS "transport_mode" text;
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN IF NOT EXISTS "created_by_user_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trip_day_activities" ADD CONSTRAINT "trip_day_activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
