-- One-time data fix: the original geocoding query used types=place only, which has no entry
-- for many small towns/villages (e.g. "Girithale" in Sri Lanka), causing Mapbox to fall back to
-- a low-relevance fuzzy match on an unrelated location in a different country (confirmed case:
-- "Girithale" resolved to "Lankaran, Azerbaijan" at relevance 0.43, matched purely on the
-- substring "lanka"). That bad result got persisted to trip_days as if it were a real geocode.
-- geocoding.ts now uses broader types (place,locality,neighborhood) plus a relevance floor, but
-- rows that already have a (possibly wrong) coordinate won't get re-geocoded by the lazy
-- backfill in GET /me/trips/:tripId/map, since that only fills in NULLs. Clearing every stored
-- coordinate forces a fresh, correctly-filtered geocode next time each trip's map is opened --
-- safe since the feature just shipped and few trips have any coordinates yet.
UPDATE "trip_days"
SET "city_from_lat" = NULL, "city_from_lng" = NULL, "city_to_lat" = NULL, "city_to_lng" = NULL
WHERE "city_from_lat" IS NOT NULL OR "city_to_lat" IS NOT NULL;
