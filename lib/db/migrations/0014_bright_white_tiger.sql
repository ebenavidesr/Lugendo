UPDATE "itinerary_days" SET "city_from_country" = "country", "city_to_country" = "country" WHERE "country" IS NOT NULL;--> statement-breakpoint
UPDATE "trip_days" SET "city_from_country" = "country", "city_to_country" = "country" WHERE "country" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_days" DROP COLUMN "country";--> statement-breakpoint
ALTER TABLE "trip_days" DROP COLUMN "country";
