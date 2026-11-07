CREATE TYPE "public"."actor_type" AS ENUM('user', 'model', 'worker', 'policy', 'runner', 'oracle', 'operator', 'system');--> statement-breakpoint
CREATE TYPE "public"."assertion_outcome" AS ENUM('pass', 'fail', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('proposed', 'validated', 'blocked', 'queued', 'running', 'completed', 'timeout', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('suspected', 'supported_by_analysis', 'confirmed_by_execution', 'not_reproduced', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."containment_rule_id" AS ENUM('network.egress_denied', 'filesystem.access_denied', 'resource.limit_enforced', 'process.limit_enforced', 'secret.access_denied');--> statement-breakpoint
CREATE TYPE "public"."environment_kind" AS ENUM('attack_twin', 'staging');--> statement-breakpoint
CREATE TYPE "public"."evidence_artifact_kind" AS ENUM('redacted_request', 'redacted_response', 'browser_screenshot', 'runner_stdout', 'containment', 'oracle', 'code_reference');--> statement-breakpoint
CREATE TYPE "public"."evidence_storage_kind" AS ENUM('db', 'object');--> statement-breakpoint
CREATE TYPE "public"."experience_mode" AS ENUM('builder', 'developer');--> statement-breakpoint
CREATE TYPE "public"."finding_category" AS ENUM('broken_object_authorization');--> statement-breakpoint
CREATE TYPE "public"."model_call_outcome" AS ENUM('success', 'malformed', 'policy_conflict', 'timeout', 'rate_limited', 'error');--> statement-breakpoint
CREATE TYPE "public"."model_provider" AS ENUM('vultr');--> statement-breakpoint
CREATE TYPE "public"."model_purpose" AS ENUM('hypothesis', 'test_plan', 'threat_model', 'remediation_guidance');--> statement-breakpoint
CREATE TYPE "public"."oracle_verdict" AS ENUM('reproduced', 'not_reproduced', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('demo', 'repo', 'url');--> statement-breakpoint
CREATE TYPE "public"."project_lifecycle" AS ENUM('draft', 'ready', 'needs_attention', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."proposal_rejection_code" AS ENUM('schema_mismatch', 'unknown_pack', 'out_of_scope_pack', 'forbidden_field', 'stale_version', 'empty_proposal');--> statement-breakpoint
CREATE TYPE "public"."proposal_validation_status" AS ENUM('valid', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."provision_status" AS ENUM('provisioning', 'ready', 'degraded', 'destroyed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."remediation_record_status" AS ENUM('suggested', 'applied', 'pending_verification', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."remediation_status" AS ENUM('open', 'in_progress', 'pending_verification', 'verified_fixed', 'accepted_risk', 'dismissed', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."replay_verdict" AS ENUM('verified_fixed', 'still_vulnerable', 'regression', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."runner_status" AS ENUM('allocated', 'created', 'running', 'stopping', 'destroyed', 'cleanup_verified', 'error', 'forced_stop', 'operator_alert');--> statement-breakpoint
CREATE TYPE "public"."sandbox_result_status" AS ENUM('completed', 'timeout', 'failed', 'killed');--> statement-breakpoint
CREATE TYPE "public"."scan_event_type" AS ENUM('workspace.created', 'project.created', 'source.connected', 'target.verified', 'scope.approved', 'scan.requested', 'scan.started', 'scan.stage.updated', 'scan.cancel_requested', 'scan.canceled', 'test.approval_required', 'test.plan.validated', 'test.executed', 'sandbox.action_blocked', 'finding.confirmed', 'scan.completed', 'scan.failed', 'remediation.created', 'replay.completed', 'finding.verified_fixed', 'github.pr.updated', 'schedule.due', 'integration.revoked', 'workspace.emergency_stopped');--> statement-breakpoint
CREATE TYPE "public"."scan_phase" AS ENUM('preparing', 'recon', 'planning', 'executing', 'verifying', 'finalizing');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('draft', 'preflight', 'awaiting_approval', 'queued', 'preparing', 'recon', 'planning', 'executing', 'verifying', 'finalizing', 'completed', 'partial', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."scan_type" AS ENUM('targeted_red_team', 'baseline_check', 'replay_verification');--> statement-breakpoint
CREATE TYPE "public"."scope_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low', 'informational');--> statement-breakpoint
CREATE TYPE "public"."target_kind" AS ENUM('demo', 'staging', 'approved_other');--> statement-breakpoint
CREATE TYPE "public"."target_state" AS ENUM('draft', 'pending_verification', 'verified', 'verification_failed', 'expired', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."target_verification_method" AS ENUM('synthetic_lab_attestation', 'dns_challenge', 'http_challenge', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."test_identity_role" AS ENUM('alice', 'bob');--> statement-breakpoint
CREATE TYPE "public"."test_pack_id" AS ENUM('bola-invoice-v1');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'developer', 'viewer');--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"experience_mode" "experience_mode" DEFAULT 'builder' NOT NULL,
	"timezone" text,
	"accessible_display_settings" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" "environment_kind" NOT NULL,
	"current_revision" text NOT NULL,
	"fixture_version" text NOT NULL,
	"provision_status" "provision_status" DEFAULT 'provisioning' NOT NULL,
	"network_profile_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destroyed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "project_kind" DEFAULT 'demo' NOT NULL,
	"lifecycle" "project_lifecycle" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid,
	"label" text NOT NULL,
	"canonical_origin" text NOT NULL,
	"target_kind" "target_kind" DEFAULT 'demo' NOT NULL,
	"state" "target_state" DEFAULT 'draft' NOT NULL,
	"verification_status" text,
	"verification_method" "target_verification_method",
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"verification_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "test_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"label" text NOT NULL,
	"role" "test_identity_role" NOT NULL,
	"synthetic" boolean DEFAULT true NOT NULL,
	"fixture_subject_id" text NOT NULL,
	"credential_secret_ref" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorization_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"status" "scope_status" DEFAULT 'active' NOT NULL,
	"allowed_hosts" text[] NOT NULL,
	"allowed_paths" text[] NOT NULL,
	"denied_paths" text[] DEFAULT '{}' NOT NULL,
	"allowed_test_pack_ids" text[] NOT NULL,
	"allowed_methods" text[] NOT NULL,
	"max_duration_seconds" integer NOT NULL,
	"max_requests" integer NOT NULL,
	"max_concurrency" integer NOT NULL,
	"max_memory_mb" integer NOT NULL,
	"max_cpu_millicores" integer,
	"network_profile_id" text,
	"permitted_environment_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope_hash" text NOT NULL,
	CONSTRAINT "authorization_scopes_scope_hash_unique" UNIQUE("scope_hash")
);
--> statement-breakpoint
CREATE TABLE "agent_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"model_call_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"raw_proposal_redacted" jsonb NOT NULL,
	"structured_plan" jsonb,
	"validation_status" "proposal_validation_status" NOT NULL,
	"rejection_code" "proposal_rejection_code",
	"policy_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"provider" "model_provider" DEFAULT 'vultr' NOT NULL,
	"model" text NOT NULL,
	"purpose" "model_purpose" NOT NULL,
	"request_id" text,
	"tokens_input" integer,
	"tokens_output" integer,
	"latency_ms" integer,
	"outcome" "model_call_outcome" NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"event_type" "scan_event_type" NOT NULL,
	"phase" "scan_phase",
	"actor_type" "actor_type" NOT NULL,
	"safe_summary" text NOT NULL,
	"payload_redacted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	"source_snapshot_ref" text,
	"target_id" uuid NOT NULL,
	"environment_id" uuid,
	"target_revision" text NOT NULL,
	"fixture_version" text,
	"scan_type" "scan_type" DEFAULT 'targeted_red_team' NOT NULL,
	"test_pack_ids" text[] NOT NULL,
	"test_pack_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"idempotency_key" text,
	"status" "scan_status" DEFAULT 'draft' NOT NULL,
	"phase" "scan_phase",
	"plan_version" integer,
	"planned_count" integer DEFAULT 0 NOT NULL,
	"executed_count" integer DEFAULT 0 NOT NULL,
	"confirmed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"failure_code" text,
	"public_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "containment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"attempt_id" uuid,
	"runner_id" uuid NOT NULL,
	"rule_id" "containment_rule_id" NOT NULL,
	"policy_version" text NOT NULL,
	"denied_operation" text NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL,
	"runtime_enforced" boolean DEFAULT true NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"safe_metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "evidence_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"attempt_id" uuid,
	"artifact_kind" "evidence_artifact_kind" NOT NULL,
	"storage_kind" "evidence_storage_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"redacted" boolean DEFAULT true NOT NULL,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"sandbox_id" text NOT NULL,
	"image_digest" text NOT NULL,
	"network_profile" text NOT NULL,
	"resource_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "runner_status" DEFAULT 'allocated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"cleanup_verified_at" timestamp with time zone,
	"timeout_at" timestamp with time zone,
	"exit_code" integer,
	"reason" text,
	CONSTRAINT "runner_instances_sandbox_id_unique" UNIQUE("sandbox_id")
);
--> statement-breakpoint
CREATE TABLE "test_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"pack_id" "test_pack_id" NOT NULL,
	"pack_version" text NOT NULL,
	"proposal_id" uuid,
	"plan_hash" text NOT NULL,
	"scope_hash" text NOT NULL,
	"actor_identity_id" uuid,
	"target_revision" text NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" "attempt_status" DEFAULT 'proposed' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"runner_id" uuid,
	"oracle_version" text,
	"verifier_verdict" "oracle_verdict",
	"verdict_reason_code" text,
	"positive_control_passed" boolean,
	"negative_security_condition_met" boolean
);
--> statement-breakpoint
CREATE TABLE "finding_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"from_status" "remediation_status" NOT NULL,
	"to_status" "remediation_status" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"attempt_id" uuid,
	"source_revision" text,
	"target_revision" text NOT NULL,
	"evidence_confidence" "confidence" NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"oracle_verdict" "oracle_verdict" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stable_fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"category" "finding_category" NOT NULL,
	"severity" "severity" NOT NULL,
	"confidence" "confidence" NOT NULL,
	"remediation_status" "remediation_status" DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latest_confirmed_attempt_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"source_commit_before" text NOT NULL,
	"source_commit_after" text,
	"summary" text NOT NULL,
	"fix_prompt_redacted" text,
	"required_invariants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "remediation_record_status" DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"original_attempt_id" uuid NOT NULL,
	"original_scan_id" uuid NOT NULL,
	"replay_scan_id" uuid,
	"patched_environment_id" uuid,
	"patched_revision" text NOT NULL,
	"pack_id" "test_pack_id" NOT NULL,
	"pack_version" text NOT NULL,
	"approval_scope_id" uuid,
	"positive_assertion_passed" boolean,
	"negative_assertion_passed" boolean,
	"verdict" "replay_verdict",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"policy_hash" text,
	"redacted_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_identities" ADD CONSTRAINT "test_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_identities" ADD CONSTRAINT "test_identities_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_scopes" ADD CONSTRAINT "authorization_scopes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_scopes" ADD CONSTRAINT "authorization_scopes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_scopes" ADD CONSTRAINT "authorization_scopes_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_scopes" ADD CONSTRAINT "authorization_scopes_permitted_environment_id_environments_id_fk" FOREIGN KEY ("permitted_environment_id") REFERENCES "public"."environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_model_call_id_model_calls_id_fk" FOREIGN KEY ("model_call_id") REFERENCES "public"."model_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_scope_id_authorization_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."authorization_scopes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containment_events" ADD CONSTRAINT "containment_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containment_events" ADD CONSTRAINT "containment_events_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containment_events" ADD CONSTRAINT "containment_events_attempt_id_test_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_attempt_id_test_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_instances" ADD CONSTRAINT "runner_instances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_instances" ADD CONSTRAINT "runner_instances_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_proposal_id_agent_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."agent_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_actor_identity_id_test_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."test_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_history" ADD CONSTRAINT "finding_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_history" ADD CONSTRAINT "finding_history_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_occurrences" ADD CONSTRAINT "finding_occurrences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_occurrences" ADD CONSTRAINT "finding_occurrences_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_occurrences" ADD CONSTRAINT "finding_occurrences_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_occurrences" ADD CONSTRAINT "finding_occurrences_attempt_id_test_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediations" ADD CONSTRAINT "remediations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediations" ADD CONSTRAINT "remediations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediations" ADD CONSTRAINT "remediations_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_patched_environment_id_environments_id_fk" FOREIGN KEY ("patched_environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_approval_scope_id_authorization_scopes_id_fk" FOREIGN KEY ("approval_scope_id") REFERENCES "public"."authorization_scopes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_workspace_members_user" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_environments_project" ON "environments" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_projects_workspace_slug" ON "projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "ix_projects_workspace_lifecycle" ON "projects" USING btree ("workspace_id","lifecycle");--> statement-breakpoint
CREATE INDEX "ix_targets_project_state" ON "targets" USING btree ("project_id","state");--> statement-breakpoint
CREATE INDEX "ix_test_identities_environment_role" ON "test_identities" USING btree ("environment_id","role");--> statement-breakpoint
CREATE INDEX "ix_scopes_target_status" ON "authorization_scopes" USING btree ("target_id","status");--> statement-breakpoint
CREATE INDEX "ix_agent_proposals_scan" ON "agent_proposals" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "ix_model_calls_scan" ON "model_calls" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scan_events_order" ON "scan_events" USING btree ("scan_id","seq");--> statement-breakpoint
CREATE INDEX "ix_scan_events_scan_time" ON "scan_events" USING btree ("scan_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scans_workspace_idempotency" ON "scans" USING btree ("workspace_id","idempotency_key") WHERE "scans"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_scans_project_recent" ON "scans" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_scans_status_created" ON "scans" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ix_scans_workspace_created" ON "scans" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_containment_scan_time" ON "containment_events" USING btree ("scan_id","observed_at");--> statement-breakpoint
CREATE INDEX "ix_evidence_tenant_attempt" ON "evidence_artifacts" USING btree ("workspace_id","attempt_id");--> statement-breakpoint
CREATE INDEX "ix_runners_status_created" ON "runner_instances" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attempts_scan_plan_number" ON "test_attempts" USING btree ("scan_id","plan_hash","attempt_number");--> statement-breakpoint
CREATE INDEX "ix_attempts_scan_started" ON "test_attempts" USING btree ("scan_id","started_at");--> statement-breakpoint
CREATE INDEX "ix_finding_history_finding" ON "finding_history" USING btree ("finding_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_occurrence_attempt" ON "finding_occurrences" USING btree ("finding_id","scan_id","attempt_id") WHERE "finding_occurrences"."attempt_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_occurrence_scan_only" ON "finding_occurrences" USING btree ("finding_id","scan_id") WHERE "finding_occurrences"."attempt_id" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_occurrences_finding" ON "finding_occurrences" USING btree ("finding_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_finding_fp" ON "findings" USING btree ("project_id","stable_fingerprint");--> statement-breakpoint
CREATE INDEX "ix_remediations_finding" ON "remediations" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "ix_replays_finding_created" ON "replays" USING btree ("finding_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_audit_workspace_created" ON "audit_events" USING btree ("workspace_id","created_at");