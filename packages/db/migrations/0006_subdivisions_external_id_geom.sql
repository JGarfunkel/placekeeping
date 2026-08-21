ALTER TABLE "subdivisions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "subdivisions" ADD COLUMN "geom" geometry(MultiPolygon,4326);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subdivisions_geom_gix" ON "subdivisions" USING gist ("geom");