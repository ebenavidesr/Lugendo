ALTER TABLE "itineraries" ADD COLUMN "source_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "itineraries_source_url_idx" ON "itineraries" USING btree ("source_url");