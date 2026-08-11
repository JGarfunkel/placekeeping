ALTER TABLE "observations" ADD COLUMN "steward_id" uuid;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "steward_start" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observations" ADD CONSTRAINT "observations_steward_id_stewards_steward_id_fk" FOREIGN KEY ("steward_id") REFERENCES "public"."stewards"("steward_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- Spots that already have a steward but no recorded start date: assume
-- stewardship began at spot creation. Approximate (overstates stewardship
-- for spots that sat open for a while first), but it's the best signal we
-- have -- there's no history of past steward assignments to do better.
-- packages/db/src/backfillObservationVegetation.ts uses this cutoff to
-- backfill observations.steward_id.
UPDATE "spots" SET "steward_start" = "date_added"
WHERE "steward_id" IS NOT NULL AND "steward_start" IS NULL;
