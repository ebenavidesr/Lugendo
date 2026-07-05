ALTER TABLE "itinerary_days" ADD COLUMN "is_transit_night" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_days" ADD COLUMN "is_transit_night" boolean DEFAULT false NOT NULL;