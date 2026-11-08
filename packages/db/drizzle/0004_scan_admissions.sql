CREATE TABLE "scan_admissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"idempotency_key" text,
	"scan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_admissions" ADD CONSTRAINT "scan_admissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_admissions" ADD CONSTRAINT "scan_admissions_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_scan_admissions_subject_window" ON "scan_admissions" USING btree ("workspace_id","subject","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scan_admissions_idempotency" ON "scan_admissions" USING btree ("workspace_id","idempotency_key") WHERE "scan_admissions"."idempotency_key" IS NOT NULL;