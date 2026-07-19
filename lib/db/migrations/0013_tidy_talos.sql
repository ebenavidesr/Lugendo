ALTER TABLE "itinerary_days" ADD COLUMN "city_from_country" text;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD COLUMN "city_to_country" text;--> statement-breakpoint
ALTER TABLE "trip_days" ADD COLUMN "city_from_country" text;--> statement-breakpoint
ALTER TABLE "trip_days" ADD COLUMN "city_to_country" text;