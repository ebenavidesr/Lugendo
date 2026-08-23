ALTER TABLE "itineraries" ADD COLUMN "published_in_search" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "trip_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "price_from" integer;