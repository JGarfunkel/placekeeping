CREATE TABLE IF NOT EXISTS "listing_sources" (
	"source_id" text PRIMARY KEY NOT NULL,
	"jurisdiction" text NOT NULL,
	"name" text NOT NULL,
	"regulation" text,
	"generated_at" timestamp with time zone,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taxon_listings" (
	"listing_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"taxon_id" uuid,
	"match_rank" text,
	"scientific_name_raw" text NOT NULL,
	"accepted_name" text NOT NULL,
	"species_name" text NOT NULL,
	"synonyms" text[] DEFAULT '{}' NOT NULL,
	"misapplied_names" text[] DEFAULT '{}' NOT NULL,
	"common_names" text[] DEFAULT '{}' NOT NULL,
	"plant_type" text,
	"ecological_rank" text,
	"socio_economic_rank" text,
	"regulatory_status" text,
	"tier" text,
	"region_classifiers" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taxon_listings" ADD CONSTRAINT "taxon_listings_source_id_listing_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."listing_sources"("source_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taxon_listings" ADD CONSTRAINT "taxon_listings_taxon_id_taxa_taxon_id_fk" FOREIGN KEY ("taxon_id") REFERENCES "public"."taxa"("taxon_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "taxon_listings_source_name_uniq" ON "taxon_listings" USING btree ("source_id",lower("accepted_name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taxon_listings_taxon_idx" ON "taxon_listings" USING btree ("taxon_id");