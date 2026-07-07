ALTER TABLE "itineraries" ADD COLUMN "trip_notes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "recommendations" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itineraries" ADD COLUMN "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_day_activities" ADD COLUMN "time_of_day" text;--> statement-breakpoint
ALTER TABLE "itinerary_day_hotels" ADD COLUMN "guaranteed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_day_hotels" ADD COLUMN "alternatives" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_day_hotels" ADD COLUMN "review_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD COLUMN "meals" text;