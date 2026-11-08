CREATE TABLE "model_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"attempt_id" text NOT NULL,
	"provider" "model_provider" DEFAULT 'vultr' NOT NULL,
	"requested_model" text NOT NULL,
	"response_model" text,
	"request_id" text,
	"tokens_input" integer,
	"tokens_output" integer,
	"latency_ms" integer,
	"outcome" "model_call_outcome" NOT NULL,
	"error_code" text,
	"oracle_verdict" "oracle_verdict" NOT NULL,
	"replay_verdict" "replay_verdict",
	"explanation" jsonb,
	"raw_explanation_redacted" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_explanations" ADD CONSTRAINT "model_explanations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_explanations" ADD CONSTRAINT "model_explanations_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_model_explanations_scan" ON "model_explanations" USING btree ("scan_id");