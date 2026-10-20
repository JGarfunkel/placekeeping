CREATE TABLE IF NOT EXISTS "identifications" (
	"identification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"user_id" uuid,
	"crop_x" real,
	"crop_y" real,
	"crop_w" real,
	"crop_h" real,
	"plantnet_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identifications_crop_chk" CHECK (("identifications"."crop_x" IS NULL AND "identifications"."crop_y" IS NULL AND "identifications"."crop_w" IS NULL AND "identifications"."crop_h" IS NULL)
        OR ("identifications"."crop_x" >= 0 AND "identifications"."crop_y" >= 0 AND "identifications"."crop_w" > 0 AND "identifications"."crop_h" > 0
        AND "identifications"."crop_x" + "identifications"."crop_w" <= 1.0001 AND "identifications"."crop_y" + "identifications"."crop_h" <= 1.0001))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "observation_plants" (
	"observation_plant_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identification_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"taxon_id" uuid NOT NULL,
	"source" text NOT NULL,
	"score" real,
	"status" text NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"raw_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_plants_source_chk" CHECK ("observation_plants"."source" IN ('plantnet','keeper')),
	CONSTRAINT "observation_plants_status_chk" CHECK ("observation_plants"."status" IN ('suggested','verified','rejected'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taxa" (
	"taxon_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gbif_key" bigint,
	"inat_taxon_id" bigint,
	"scientific_name" text NOT NULL,
	"common_name" text,
	"family" text,
	"rank" text,
	CONSTRAINT "taxa_gbif_key_unique" UNIQUE("gbif_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identifications" ADD CONSTRAINT "identifications_observation_id_observations_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("observation_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identifications" ADD CONSTRAINT "identifications_photo_id_photos_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("photo_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "identifications" ADD CONSTRAINT "identifications_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observation_plants" ADD CONSTRAINT "observation_plants_identification_id_identifications_identification_id_fk" FOREIGN KEY ("identification_id") REFERENCES "public"."identifications"("identification_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observation_plants" ADD CONSTRAINT "observation_plants_observation_id_observations_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("observation_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observation_plants" ADD CONSTRAINT "observation_plants_taxon_id_taxa_taxon_id_fk" FOREIGN KEY ("taxon_id") REFERENCES "public"."taxa"("taxon_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observation_plants" ADD CONSTRAINT "observation_plants_verified_by_users_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identifications_observation_idx" ON "identifications" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identifications_quota_idx" ON "identifications" USING btree ("user_id","created_at") WHERE "identifications"."plantnet_status" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "observation_plants_ident_taxon_source_uniq" ON "observation_plants" USING btree ("identification_id","taxon_id","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observation_plants_observation_idx" ON "observation_plants" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observation_plants_verified_taxon_idx" ON "observation_plants" USING btree ("taxon_id") WHERE "observation_plants"."status" = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "observation_plants_one_verified_uniq" ON "observation_plants" USING btree ("identification_id") WHERE "observation_plants"."status" = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "taxa_name_no_gbif_uniq" ON "taxa" USING btree (lower("scientific_name")) WHERE "taxa"."gbif_key" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taxa_scientific_name_idx" ON "taxa" USING btree (lower("scientific_name"));
--> statement-breakpoint
-- Hand-written (drizzle-kit doesn't track views): which spots have which
-- verified plant, with first/last seen. Refreshed by refreshSpotTaxa() in
-- @placekeeping/core (called from the daily maintenance cron).
CREATE MATERIALIZED VIEW IF NOT EXISTS "spot_taxa" AS
SELECT o.spot_id, op.taxon_id,
       min(o.observed_at) AS first_seen,
       max(o.observed_at) AS last_seen,
       count(*)::int      AS observation_count
FROM "observation_plants" op
JOIN "observations" o ON o.observation_id = op.observation_id
WHERE op.status = 'verified'
GROUP BY o.spot_id, op.taxon_id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spot_taxa_spot_taxon_uniq" ON "spot_taxa" ("spot_id", "taxon_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spot_taxa_taxon_idx" ON "spot_taxa" ("taxon_id");
