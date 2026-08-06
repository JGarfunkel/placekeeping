CREATE TYPE "public"."address_visibility" AS ENUM('public', 'municipality', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."parcel_status" AS ENUM('resolved', 'no_parcel');--> statement-breakpoint
CREATE TYPE "public"."photo_moderation_status" AS ENUM('approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."place_access" AS ENUM('public', 'none', 'private_club', 'school', 'visible_from_street');--> statement-breakpoint
CREATE TYPE "public"."spot_purpose" AS ENUM('garden', 'monument', 'wild_area', 'none');--> statement-breakpoint
CREATE TYPE "public"."steward_member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."steward_type" AS ENUM('individual', 'school', 'club', 'nonprofit', 'municipality');--> statement-breakpoint
CREATE TYPE "public"."verification_entity_type" AS ENUM('user', 'steward');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"writes_paused" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "observations" (
	"observation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" integer NOT NULL,
	"observed_at" date DEFAULT CURRENT_DATE NOT NULL,
	"observer_name" text,
	"observer_id" uuid,
	"notes" text,
	"photo_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"inaturalist_obs_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parcels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"swis_sbl_id" text NOT NULL,
	"swis" text,
	"print_key" text,
	"address" text,
	"county_name" text,
	"muni_name" text,
	"citytown_name" text,
	"prop_class" text,
	"calc_acres" numeric(12, 4),
	"nys_name" text,
	"roll_yr" integer,
	"spatial_yr" integer,
	"geom" geometry(MultiPolygon,4326) NOT NULL,
	"source" text DEFAULT 'nys_gis' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_revealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photos" (
	"photo_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"uploaded_by_user_id" uuid,
	"moderation_status" "photo_moderation_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_parcels" (
	"site_id" integer NOT NULL,
	"swis_sbl_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_parcels_site_id_swis_sbl_id_pk" PRIMARY KEY("site_id","swis_sbl_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sites" (
	"site_id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"geom" geometry(MultiPolygon,4326),
	"gis_open_space" text,
	"gis_land_use" text,
	"hnp_map_number" integer,
	"stewardship_program" text,
	"stewardship_ref" text,
	"legal_owner" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spots" (
	"spot_id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"address" text,
	"parcel_id" text,
	"parcel_sbl" text,
	"resolved_roll_yr" integer,
	"parcel_status" "parcel_status",
	"address_visibility" "address_visibility" DEFAULT 'public' NOT NULL,
	"state" text,
	"municipality" text,
	"postal_city" text,
	"county" text,
	"size_sqft" numeric(12, 2),
	"vegetation" text,
	"weed_level" text DEFAULT 'minimal' NOT NULL,
	"educational_component" boolean DEFAULT false NOT NULL,
	"educational_notes" text,
	"steward_id" uuid,
	"steward_name" text,
	"created_by_user_id" uuid,
	"site_id" integer,
	"purpose" "spot_purpose",
	"access" "place_access",
	"description" text,
	"needs" text,
	"plans" text,
	"website" text,
	"cover_photo_url" text,
	"photo_album_url" text,
	"inaturalist_url" text,
	"use_municipality_for_slug" boolean DEFAULT false NOT NULL,
	"slug_state" text,
	"slug_locality" text,
	"slug" text,
	"date_added" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "steward_members" (
	"steward_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "steward_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "steward_members_steward_id_user_id_pk" PRIMARY KEY("steward_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stewards" (
	"steward_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "steward_type" DEFAULT 'individual' NOT NULL,
	"url" text,
	"contact" text,
	"logo_url" text,
	"public_display" boolean DEFAULT true NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subdivisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" integer NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"county" text,
	"type" text,
	"center_lat" numeric(9, 6),
	"center_lng" numeric(9, 6),
	"zoom" integer,
	"spot_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" text NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"is_system_admin" boolean DEFAULT false NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "verification_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_paused_by_user_id_users_user_id_fk" FOREIGN KEY ("paused_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observations" ADD CONSTRAINT "observations_spot_id_spots_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("spot_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "observations" ADD CONSTRAINT "observations_observer_id_users_user_id_fk" FOREIGN KEY ("observer_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photos" ADD CONSTRAINT "photos_observation_id_observations_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("observation_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_user_id_users_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_parcels" ADD CONSTRAINT "site_parcels_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spots" ADD CONSTRAINT "spots_steward_id_stewards_steward_id_fk" FOREIGN KEY ("steward_id") REFERENCES "public"."stewards"("steward_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spots" ADD CONSTRAINT "spots_created_by_user_id_users_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spots" ADD CONSTRAINT "spots_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "steward_members" ADD CONSTRAINT "steward_members_steward_id_stewards_steward_id_fk" FOREIGN KEY ("steward_id") REFERENCES "public"."stewards"("steward_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "steward_members" ADD CONSTRAINT "steward_members_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stewards" ADD CONSTRAINT "stewards_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_spot_id_idx" ON "observations" USING btree ("spot_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcels_geom_gix" ON "parcels" USING gist ("geom");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parcels_swis_sbl_roll_yr_idx" ON "parcels" USING btree ("swis_sbl_id","roll_yr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_observation_id_idx" ON "photos" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_parcels_swis_sbl_id_idx" ON "site_parcels" USING btree ("swis_sbl_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sites_geom_gix" ON "sites" USING gist ("geom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spots_location_gix" ON "spots" USING gist ("location");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spots_steward_id_idx" ON "spots" USING btree ("steward_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spots_vegetation_idx" ON "spots" USING btree ("vegetation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spots_site_id_idx" ON "spots" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spots_unstewarded_idx" ON "spots" USING btree ("spot_id") WHERE "spots"."steward_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spots_slug_idx" ON "spots" USING btree ("slug_state","slug_locality","slug") WHERE "spots"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "steward_members_user_id_idx" ON "steward_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stewards_slug_idx" ON "stewards" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subdivisions_path_idx" ON "subdivisions" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_idx" ON "verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_tokens_entity_idx" ON "verification_tokens" USING btree ("entity_type","entity_id");