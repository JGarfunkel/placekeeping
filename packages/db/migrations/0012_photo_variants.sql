ALTER TABLE "photos" ADD COLUMN "variants" jsonb;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "replaced_at" timestamp with time zone;