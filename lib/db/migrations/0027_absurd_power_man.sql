ALTER TABLE "trip_day_activities" ADD COLUMN "shared_with_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_notes" ADD COLUMN "shared_with_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD COLUMN "shared_with_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_links" ADD COLUMN "shared_with_all" boolean DEFAULT false NOT NULL;