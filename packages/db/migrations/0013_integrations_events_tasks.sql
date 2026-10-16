CREATE TABLE IF NOT EXISTS "care_event_participants" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'going' NOT NULL,
	"role" text DEFAULT 'volunteer' NOT NULL,
	"attended" boolean,
	"confirmed_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"timeslot" text,
	"confirmation_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_event_participants_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "care_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" integer,
	"spot_id" integer,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"event_type" text DEFAULT 'cleanup' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"location_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"signup_open" boolean DEFAULT true NOT NULL,
	"signup_deadline" timestamp with time zone,
	"what_to_bring" text DEFAULT '' NOT NULL,
	"notes_for_volunteers" text DEFAULT '' NOT NULL,
	"cancel_reason" text,
	"url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_events_target_chk" CHECK (("care_events"."site_id" IS NOT NULL)::int + ("care_events"."spot_id" IS NOT NULL)::int = 1),
	CONSTRAINT "care_events_end_chk" CHECK ("care_events"."end_at" > "care_events"."start_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"system" text NOT NULL,
	"remote_workspace_id" text NOT NULL,
	"remote_workspace_name" text,
	"remote_user_id" text NOT NULL,
	"remote_user_name" text,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"system" text NOT NULL,
	"remote_type" text NOT NULL,
	"remote_id" text NOT NULL,
	"remote_url" text NOT NULL,
	"cached_title" text,
	"cached_status" text,
	"cached_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" integer,
	"spot_id" integer,
	"steward_id" uuid,
	"system" text NOT NULL,
	"remote_workspace_id" text NOT NULL,
	"remote_project_id" text NOT NULL,
	"remote_project_name" text,
	"remote_section_id" text,
	"configured_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_bindings_scope_chk" CHECK (("integration_bindings"."site_id" IS NOT NULL)::int + ("integration_bindings"."spot_id" IS NOT NULL)::int + ("integration_bindings"."steward_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_task_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_task_id" uuid NOT NULL,
	"spot_id" integer NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"external_link_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"steward_id" uuid,
	"site_id" integer,
	"spot_id" integer,
	"system" text NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"unit" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"anchor_date" date NOT NULL,
	"lead_days" integer DEFAULT 30 NOT NULL,
	"next_due_on" date NOT NULL,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_reason" text,
	"configured_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_tasks_scope_chk" CHECK (("recurring_tasks"."site_id" IS NOT NULL)::int + ("recurring_tasks"."spot_id" IS NOT NULL)::int + ("recurring_tasks"."steward_id" IS NOT NULL)::int = 1),
	CONSTRAINT "recurring_tasks_interval_chk" CHECK ("recurring_tasks"."interval" >= 1),
	CONSTRAINT "recurring_tasks_lead_chk" CHECK ("recurring_tasks"."lead_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"external_id" text,
	"external_author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" integer,
	"spot_id" integer,
	"observation_id" uuid,
	"event_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_on" date,
	"assignee_user_id" uuid,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"source_type" text,
	"source_id" text,
	"external_sync_status" text,
	"external_sync_error" text,
	"external_sync_attempts" integer DEFAULT 0 NOT NULL,
	"external_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_target_chk" CHECK (("tasks"."site_id" IS NOT NULL)::int + ("tasks"."spot_id" IS NOT NULL)::int + ("tasks"."observation_id" IS NOT NULL)::int + ("tasks"."event_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "care_event_participants" ADD CONSTRAINT "care_event_participants_event_id_care_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."care_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "care_event_participants" ADD CONSTRAINT "care_event_participants_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "care_events" ADD CONSTRAINT "care_events_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "care_events" ADD CONSTRAINT "care_events_spot_id_spots_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("spot_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "care_events" ADD CONSTRAINT "care_events_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "external_links" ADD CONSTRAINT "external_links_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_bindings" ADD CONSTRAINT "integration_bindings_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_bindings" ADD CONSTRAINT "integration_bindings_spot_id_spots_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("spot_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_bindings" ADD CONSTRAINT "integration_bindings_steward_id_stewards_steward_id_fk" FOREIGN KEY ("steward_id") REFERENCES "public"."stewards"("steward_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_bindings" ADD CONSTRAINT "integration_bindings_configured_by_users_user_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_task_occurrences" ADD CONSTRAINT "recurring_task_occurrences_recurring_task_id_recurring_tasks_id_fk" FOREIGN KEY ("recurring_task_id") REFERENCES "public"."recurring_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_task_occurrences" ADD CONSTRAINT "recurring_task_occurrences_spot_id_spots_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("spot_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_task_occurrences" ADD CONSTRAINT "recurring_task_occurrences_external_link_id_external_links_id_fk" FOREIGN KEY ("external_link_id") REFERENCES "public"."external_links"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_steward_id_stewards_steward_id_fk" FOREIGN KEY ("steward_id") REFERENCES "public"."stewards"("steward_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_spot_id_spots_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("spot_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_configured_by_users_user_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_spot_id_spots_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("spot_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_observation_id_observations_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("observation_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_care_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."care_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_users_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_event_participants_user_idx" ON "care_event_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "care_event_participants_token_idx" ON "care_event_participants" USING btree ("confirmation_token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_events_site_idx" ON "care_events" USING btree ("site_id","start_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_events_spot_idx" ON "care_events" USING btree ("spot_id","start_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_events_start_idx" ON "care_events" USING btree ("start_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_identities_unique_idx" ON "external_identities" USING btree ("user_id","system","remote_workspace_id","remote_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_identities_user_idx" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "external_links_target_idx" ON "external_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_links_remote_idx" ON "external_links" USING btree ("system","remote_type","remote_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_bindings_site_idx" ON "integration_bindings" USING btree ("site_id","system") WHERE "integration_bindings"."site_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_bindings_spot_idx" ON "integration_bindings" USING btree ("spot_id","system") WHERE "integration_bindings"."spot_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_bindings_steward_idx" ON "integration_bindings" USING btree ("steward_id","system") WHERE "integration_bindings"."steward_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recurring_task_occurrences_uniq" ON "recurring_task_occurrences" USING btree ("recurring_task_id","spot_id","due_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_task_occurrences_status_idx" ON "recurring_task_occurrences" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_due_idx" ON "recurring_tasks" USING btree ("status","next_due_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_steward_idx" ON "recurring_tasks" USING btree ("steward_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_site_idx" ON "recurring_tasks" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_spot_idx" ON "recurring_tasks" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_site_idx" ON "tasks" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_spot_idx" ON "tasks" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_observation_idx" ON "tasks" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_event_idx" ON "tasks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_idx" ON "tasks" USING btree ("assignee_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_idx" ON "tasks" USING btree ("due_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_sync_idx" ON "tasks" USING btree ("external_sync_status","external_synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_comments_external_idx" ON "task_comments" USING btree ("task_id","external_id") WHERE "task_comments"."external_id" IS NOT NULL;
