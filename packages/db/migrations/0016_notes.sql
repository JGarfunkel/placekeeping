CREATE TABLE IF NOT EXISTS "notes" (
	"note_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid,
	"observation_id" uuid,
	"title" text,
	"body" text NOT NULL,
	"signed" boolean DEFAULT true NOT NULL,
	"promoted_at" timestamp with time zone,
	"promoted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_observation_id_observations_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("observation_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_promoted_by_user_id_users_user_id_fk" FOREIGN KEY ("promoted_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_author_id_idx" ON "notes" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_observation_id_idx" ON "notes" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_promoted_at_idx" ON "notes" USING btree ("promoted_at");