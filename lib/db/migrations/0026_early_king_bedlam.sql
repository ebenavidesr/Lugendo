CREATE TABLE "trip_link_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"traveler_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_link_shares_link_id_traveler_id_unique" UNIQUE("link_id","traveler_id")
);
--> statement-breakpoint
CREATE TABLE "trip_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_link_shares" ADD CONSTRAINT "trip_link_shares_link_id_trip_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."trip_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_link_shares" ADD CONSTRAINT "trip_link_shares_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_links" ADD CONSTRAINT "trip_links_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_links" ADD CONSTRAINT "trip_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;