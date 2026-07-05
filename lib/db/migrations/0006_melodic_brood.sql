CREATE TABLE "country_advisories" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_name" text NOT NULL,
	"source_url" text NOT NULL,
	"content_text" text,
	"content_hash" text,
	"official_updated_at" text,
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_advisories_country_name_unique" UNIQUE("country_name")
);
--> statement-breakpoint
CREATE TABLE "trip_advisory_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"country_name" text NOT NULL,
	"seen_hash" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_advisory_views_trip_id_user_id_country_name_unique" UNIQUE("trip_id","user_id","country_name")
);
--> statement-breakpoint
ALTER TABLE "trip_advisory_views" ADD CONSTRAINT "trip_advisory_views_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_advisory_views" ADD CONSTRAINT "trip_advisory_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;