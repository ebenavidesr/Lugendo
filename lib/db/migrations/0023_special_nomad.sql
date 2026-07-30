CREATE TABLE "trip_day_activity_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_link_id" integer NOT NULL,
	"traveler_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_day_activity_participants_activity_link_id_traveler_id_unique" UNIQUE("activity_link_id","traveler_id")
);
--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN "cost_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "trip_day_activities" ADD COLUMN "cost_currency" text DEFAULT 'EUR';--> statement-breakpoint
ALTER TABLE "trip_day_activity_participants" ADD CONSTRAINT "trip_day_activity_participants_activity_link_id_trip_day_activities_id_fk" FOREIGN KEY ("activity_link_id") REFERENCES "public"."trip_day_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_day_activity_participants" ADD CONSTRAINT "trip_day_activity_participants_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;