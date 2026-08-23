ALTER TABLE "itineraries" ALTER COLUMN "published_in_search" SET DEFAULT true;--> statement-breakpoint
-- Backfill: el modelo pasa de opt-in a opt-out (decisión de producto tras QA de #161) —
-- los itinerarios existentes deben aparecer en el buscador por defecto, igual que los nuevos.
UPDATE "itineraries" SET "published_in_search" = true WHERE "published_in_search" = false;