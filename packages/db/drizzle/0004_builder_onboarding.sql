CREATE TYPE "public"."passive_recon_status" AS ENUM('running', 'completed', 'partial', 'failed', 'quota_limited', 'unreachable');--> statement-breakpoint
CREATE TYPE "public"."site_verification_method" AS ENUM('dns-txt', 'well-known');--> statement-breakpoint
CREATE TYPE "public"."site_verification_status" AS ENUM('pending', 'verified', 'failed', 'expired', 'unreachable');--> statement-breakpoint
CREATE TABLE "passive_recon_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"observed" boolean NOT NULL,
	"detail" text,
	"severity" text DEFAULT 'informational' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passive_recon_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"permission_id" uuid,
	"run_by" uuid NOT NULL,
	"status" "passive_recon_status" DEFAULT 'running' NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"bytes_received" integer DEFAULT 0 NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"error_detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"allowed_paths" text[] NOT NULL,
	"consent_version" text NOT NULL,
	"consent_text" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE TABLE "site_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" "site_verification_status" DEFAULT 'pending' NOT NULL,
	"method" "site_verification_method",
	"dns_record_name" text NOT NULL,
	"dns_txt_value" text NOT NULL,
	"well_known_url" text NOT NULL,
	"well_known_expected_body" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "passive_recon_observations" ADD CONSTRAINT "passive_recon_observations_run_id_passive_recon_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."passive_recon_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passive_recon_runs" ADD CONSTRAINT "passive_recon_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passive_recon_runs" ADD CONSTRAINT "passive_recon_runs_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passive_recon_runs" ADD CONSTRAINT "passive_recon_runs_permission_id_site_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."site_permissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_permissions" ADD CONSTRAINT "site_permissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_permissions" ADD CONSTRAINT "site_permissions_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_verifications" ADD CONSTRAINT "site_verifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_verifications" ADD CONSTRAINT "site_verifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_verifications" ADD CONSTRAINT "site_verifications_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_passive_recon_obs_run" ON "passive_recon_observations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ix_passive_recon_runs_target" ON "passive_recon_runs" USING btree ("target_id","started_at");--> statement-breakpoint
CREATE INDEX "ix_passive_recon_runs_workspace" ON "passive_recon_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ix_site_permissions_target" ON "site_permissions" USING btree ("target_id","revoked_at");--> statement-breakpoint
CREATE INDEX "ix_site_permissions_workspace" ON "site_permissions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ix_site_verifications_target" ON "site_verifications" USING btree ("target_id","status");--> statement-breakpoint
CREATE INDEX "ix_site_verifications_workspace" ON "site_verifications" USING btree ("workspace_id");