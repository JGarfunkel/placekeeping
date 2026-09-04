ALTER TABLE "spots" ALTER COLUMN "purpose" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "focus" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "species_blooming" integer;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "focus" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "setting" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "bloom_months" smallint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_bloom_months_check" CHECK ("bloom_months" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]);--> statement-breakpoint
CREATE INDEX "spots_bloom_months_gin" ON "spots" USING GIN ("bloom_months");--> statement-breakpoint
DROP TYPE "public"."spot_purpose";