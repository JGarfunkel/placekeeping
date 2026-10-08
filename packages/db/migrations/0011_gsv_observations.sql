ALTER TABLE "observations" ADD COLUMN "source" text DEFAULT 'keeper';--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "gsv_ref" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "observations_gsv_pano_uniq" ON "observations" USING btree ("spot_id",("gsv_ref"->>'panoId')) WHERE "observations"."source" = 'gsv';--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_gsv_ref_chk" CHECK ((COALESCE("observations"."source", 'keeper') = 'gsv') = ("observations"."gsv_ref" IS NOT NULL));
