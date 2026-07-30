CREATE TABLE "trip_photo_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"share_code" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_photo_shares_share_code_unique" UNIQUE("share_code")
);
--> statement-breakpoint
ALTER TABLE "trip_photo_shares" ADD CONSTRAINT "trip_photo_shares_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_photo_shares" ADD CONSTRAINT "trip_photo_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;