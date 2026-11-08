CREATE TABLE "github_repo_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"workspace_id" uuid,
	"owner_user_id" text NOT NULL,
	"repo_id" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text NOT NULL,
	"commit_sha" text NOT NULL,
	"repo_meta" jsonb,
	"recon_result" jsonb,
	"recon_at" timestamp with time zone,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_source_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"owner_user_id" text NOT NULL,
	"composio_session_id" text NOT NULL,
	"composio_connected_account_id" text,
	"auth_config_id" text NOT NULL,
	"github_login" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "github_repo_sources" ADD CONSTRAINT "github_repo_sources_connection_id_github_source_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_source_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repo_sources" ADD CONSTRAINT "github_repo_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_source_connections" ADD CONSTRAINT "github_source_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gh_repo_src_connection" ON "github_repo_sources" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "ix_gh_repo_src_owner" ON "github_repo_sources" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gh_src_conn_session" ON "github_source_connections" USING btree ("composio_session_id");--> statement-breakpoint
CREATE INDEX "ix_gh_src_conn_owner" ON "github_source_connections" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "ix_gh_src_conn_status" ON "github_source_connections" USING btree ("owner_user_id","status");