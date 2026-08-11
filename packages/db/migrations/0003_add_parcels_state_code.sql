DROP INDEX IF EXISTS "parcels_swis_sbl_roll_yr_idx";--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "state_code" text DEFAULT 'ny' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parcels_state_swis_sbl_roll_yr_idx" ON "parcels" USING btree ("state_code","swis_sbl_id","roll_yr");