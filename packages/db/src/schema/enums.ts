import { pgEnum } from "drizzle-orm/pg-core";

/**
 * PostgreSQL enum types.
 *
 * Each value mirrors a closed `z.enum` in `@highcastle/contracts`
 * (`packages/contracts/src/enums.ts`). Additive values require a contract
 * version bump and a new immutable migration — never edit a created enum
 * in place (use `ALTER TYPE ... ADD VALUE` in a follow-up migration).
 */

// --- Tenancy / membership ---

export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "developer", "viewer"]);

export const experienceMode = pgEnum("experience_mode", ["builder", "developer"]);

// --- Projects / sources ---

export const projectKind = pgEnum("project_kind", ["demo", "repo", "url"]);

export const projectLifecycle = pgEnum("project_lifecycle", [
  "draft",
  "ready",
  "needs_attention",
  "paused",
  "archived",
]);

// --- Targets / environments / test identities ---

export const targetKind = pgEnum("target_kind", ["demo", "staging", "approved_other"]);

export const targetState = pgEnum("target_state", [
  "draft",
  "pending_verification",
  "verified",
  "verification_failed",
  "expired",
  "disabled",
]);

export const targetVerificationMethod = pgEnum("target_verification_method", [
  "synthetic_lab_attestation",
  "dns_challenge",
  "http_challenge",
  "manual_review",
]);

export const environmentKind = pgEnum("environment_kind", ["attack_twin", "staging"]);

export const provisionStatus = pgEnum("provision_status", [
  "provisioning",
  "ready",
  "degraded",
  "destroyed",
  "failed",
]);

export const testIdentityRole = pgEnum("test_identity_role", ["alice", "bob"]);

// --- Authorization scopes ---

export const scopeStatus = pgEnum("scope_status", ["active", "revoked", "expired"]);

// --- Scans ---

export const scanType = pgEnum("scan_type", [
  "targeted_red_team",
  "baseline_check",
  "replay_verification",
]);

export const scanStatus = pgEnum("scan_status", [
  "draft",
  "preflight",
  "awaiting_approval",
  "queued",
  "preparing",
  "recon",
  "planning",
  "executing",
  "verifying",
  "finalizing",
  "completed",
  "partial",
  "failed",
  "canceled",
]);

export const scanPhase = pgEnum("scan_phase", [
  "preparing",
  "recon",
  "planning",
  "executing",
  "verifying",
  "finalizing",
]);

export const actorType = pgEnum("actor_type", [
  "user",
  "model",
  "worker",
  "policy",
  "runner",
  "oracle",
  "operator",
  "system",
]);

export const scanEventType = pgEnum("scan_event_type", [
  "workspace.created",
  "project.created",
  "source.connected",
  "target.verified",
  "scope.approved",
  "scan.requested",
  "scan.started",
  "scan.stage.updated",
  "scan.cancel_requested",
  "scan.canceled",
  "test.approval_required",
  "test.plan.validated",
  "test.executed",
  "sandbox.action_blocked",
  "finding.confirmed",
  "scan.completed",
  "scan.failed",
  "remediation.created",
  "replay.completed",
  "finding.verified_fixed",
  "github.pr.updated",
  "schedule.due",
  "integration.revoked",
  "workspace.emergency_stopped",
]);

// --- Attempts / oracle ---

export const attemptStatus = pgEnum("attempt_status", [
  "proposed",
  "validated",
  "blocked",
  "queued",
  "running",
  "completed",
  "timeout",
  "failed",
  "canceled",
]);

export const oracleVerdict = pgEnum("oracle_verdict", [
  "reproduced",
  "not_reproduced",
  "inconclusive",
]);

export const assertionOutcome = pgEnum("assertion_outcome", ["pass", "fail", "unknown"]);

export const testPackId = pgEnum("test_pack_id", ["bola-invoice-v1"]);

// --- Evidence ---

export const evidenceArtifactKind = pgEnum("evidence_artifact_kind", [
  "redacted_request",
  "redacted_response",
  "browser_screenshot",
  "runner_stdout",
  "containment",
  "oracle",
  "code_reference",
]);

export const evidenceStorageKind = pgEnum("evidence_storage_kind", ["db", "object"]);

// --- Containment ---

export const containmentRuleId = pgEnum("containment_rule_id", [
  "network.egress_denied",
  "filesystem.access_denied",
  "resource.limit_enforced",
  "process.limit_enforced",
  "secret.access_denied",
]);

// --- Findings ---

export const findingCategory = pgEnum("finding_category", ["broken_object_authorization"]);

export const severity = pgEnum("severity", ["critical", "high", "medium", "low", "informational"]);

export const confidence = pgEnum("confidence", [
  "suspected",
  "supported_by_analysis",
  "confirmed_by_execution",
  "not_reproduced",
  "inconclusive",
]);

export const remediationStatus = pgEnum("remediation_status", [
  "open",
  "in_progress",
  "pending_verification",
  "verified_fixed",
  "accepted_risk",
  "dismissed",
  "reopened",
]);

export const remediationRecordStatus = pgEnum("remediation_record_status", [
  "suggested",
  "applied",
  "pending_verification",
  "verified",
  "failed",
]);

// --- Replay / verification ---

export const replayVerdict = pgEnum("replay_verdict", [
  "verified_fixed",
  "still_vulnerable",
  "regression",
  "inconclusive",
]);

// --- Inference ---

export const modelProvider = pgEnum("model_provider", ["vultr"]);

export const modelPurpose = pgEnum("model_purpose", [
  "hypothesis",
  "test_plan",
  "threat_model",
  "remediation_guidance",
]);

export const modelCallOutcome = pgEnum("model_call_outcome", [
  "success",
  "malformed",
  "policy_conflict",
  "timeout",
  "rate_limited",
  "error",
]);

export const proposalValidationStatus = pgEnum("proposal_validation_status", ["valid", "invalid"]);

export const proposalRejectionCode = pgEnum("proposal_rejection_code", [
  "schema_mismatch",
  "unknown_pack",
  "out_of_scope_pack",
  "forbidden_field",
  "stale_version",
  "empty_proposal",
]);

// --- Sandbox / runner ---

export const runnerStatus = pgEnum("runner_status", [
  "allocated",
  "created",
  "running",
  "stopping",
  "destroyed",
  "cleanup_verified",
  "error",
  "forced_stop",
  "operator_alert",
]);

export const sandboxResultStatus = pgEnum("sandbox_result_status", [
  "completed",
  "timeout",
  "failed",
  "killed",
]);
