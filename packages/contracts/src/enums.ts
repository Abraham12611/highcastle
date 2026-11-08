import { z } from "zod";

/**
 * Shared enumerations.
 *
 * Each enum mirrors a value set from the specs:
 * - architecture/03_DATABASE_SCHEMA.md (roles, lifecycles, statuses)
 * - architecture/04_RELATIONSHIPS_AND_STATES.md (scan/finding/runner machines)
 * - agents/02_TEST_PACK_AND_VERIFICATION.md (verdict matrices)
 * - security/02_CONTAINMENT_AND_AUTHORIZATION.md (containment rules)
 *
 * Enums are closed sets parsed with `z.enum`. Additive values require a
 * contract version bump and coordinator sign-off — consumers switch
 * exhaustively, so an unexpected string must fail loudly, never coerce.
 */

// --- Tenancy / membership ---

export const WorkspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "developer",
  "viewer",
]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const ExperienceModeSchema = z.enum(["builder", "developer"]);
export type ExperienceMode = z.infer<typeof ExperienceModeSchema>;

// --- Projects / sources ---

export const ProjectKindSchema = z.enum(["demo", "repo", "url"]);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

export const ProjectLifecycleSchema = z.enum([
  "draft",
  "ready",
  "needs_attention",
  "paused",
  "archived",
]);
export type ProjectLifecycle = z.infer<typeof ProjectLifecycleSchema>;

/** Derived UI readiness (computed, never stored as the lifecycle). */
export const ProjectReadinessSchema = z.enum([
  "draft",
  "source_connected",
  "target_pending_verification",
  "target_verified",
  "authorized",
  "ready",
  "needs_attention",
  "paused",
  "archived",
]);
export type ProjectReadiness = z.infer<typeof ProjectReadinessSchema>;

// --- Targets / environments / test identities ---

export const TargetKindSchema = z.enum(["demo", "staging", "approved_other"]);
export type TargetKind = z.infer<typeof TargetKindSchema>;

export const TargetStateSchema = z.enum([
  "draft",
  "pending_verification",
  "verified",
  "verification_failed",
  "expired",
  "disabled",
]);
export type TargetState = z.infer<typeof TargetStateSchema>;

export const TargetVerificationMethodSchema = z.enum([
  "synthetic_lab_attestation",
  "dns_challenge",
  "http_challenge",
  "manual_review",
]);
export type TargetVerificationMethod = z.infer<
  typeof TargetVerificationMethodSchema
>;

export const EnvironmentKindSchema = z.enum(["attack_twin", "staging"]);
export type EnvironmentKind = z.infer<typeof EnvironmentKindSchema>;

export const ProvisionStatusSchema = z.enum([
  "provisioning",
  "ready",
  "degraded",
  "destroyed",
  "failed",
]);
export type ProvisionStatus = z.infer<typeof ProvisionStatusSchema>;

/** H demo fixtures: Alice owns tenant_A/invoice_A, Bob owns tenant_B/invoice_B. */
export const TestIdentityRoleSchema = z.enum(["alice", "bob"]);
export type TestIdentityRole = z.infer<typeof TestIdentityRoleSchema>;

// --- Authorization scopes ---

export const ScopeStatusSchema = z.enum(["active", "revoked", "expired"]);
export type ScopeStatus = z.infer<typeof ScopeStatusSchema>;

// --- Scans ---

export const ScanTypeSchema = z.enum([
  "targeted_red_team",
  "baseline_check",
  "replay_verification",
]);
export type ScanType = z.infer<typeof ScanTypeSchema>;

/**
 * Full scan lifecycle (04_RELATIONSHIPS_AND_STATES).
 * `cancel_requested` is a separate timestamp flag, not a status — cancellation
 * is recorded on the scan row while the terminal move goes to `canceled`.
 */
export const ScanStatusSchema = z.enum([
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
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

export const SCAN_TERMINAL_STATUSES = [
  "completed",
  "partial",
  "failed",
  "canceled",
] as const satisfies readonly ScanStatus[];

export type ScanTerminalStatus = (typeof SCAN_TERMINAL_STATUSES)[number];

export function isTerminalScanStatus(status: ScanStatus): boolean {
  return (SCAN_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Execution phase reported on scan events (SSE `phase`). */
export const ScanPhaseSchema = z.enum([
  "preparing",
  "recon",
  "planning",
  "executing",
  "verifying",
  "finalizing",
]);
export type ScanPhase = z.infer<typeof ScanPhaseSchema>;

export const ActorTypeSchema = z.enum([
  "user",
  "model",
  "worker",
  "policy",
  "runner",
  "oracle",
  "operator",
  "system",
]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

/** Durable event catalog (architecture/06_EVENTS_AND_JOBS). */
export const ScanEventTypeSchema = z.enum([
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
export type ScanEventType = z.infer<typeof ScanEventTypeSchema>;

// --- Attempts / oracle ---

export const AttemptStatusSchema = z.enum([
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
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

/** Independent deterministic oracle verdict — never set by model or client. */
export const OracleVerdictSchema = z.enum([
  "reproduced",
  "not_reproduced",
  "inconclusive",
]);
export type OracleVerdict = z.infer<typeof OracleVerdictSchema>;

/** Assertion outcome for one leg of the BOLA matrix. */
export const AssertionOutcomeSchema = z.enum(["pass", "fail", "unknown"]);
export type AssertionOutcome = z.infer<typeof AssertionOutcomeSchema>;

// --- Test packs ---

/**
 * Enumerated executable test packs. The model may only *name* a pack from
 * this list — it can never describe arbitrary commands, hosts, or tools.
 * New packs are a contract change (coordinator + L15).
 */
export const TestPackIdSchema = z.enum(["bola-invoice-v1"]);
export type TestPackId = z.infer<typeof TestPackIdSchema>;

/** H pack declaration (agents/02_TEST_PACK_AND_VERIFICATION). */
export const TEST_PACK_MANIFEST = {
  "bola-invoice-v1": {
    version: "1.0.0",
    targetKind: "owned_demo_lab",
    category: "broken_object_authorization",
    requiredRoles: ["alice", "bob"],
    permittedMethods: ["GET"],
    maxRequests: 8,
    maxDurationSeconds: 30,
    oracleVersion: "bola-oracle-v1",
    mutating: false,
  },
} as const;

/** HTTP methods a test pack may use. H is read-only: GET only. */
export const TestPackMethodSchema = z.enum(["GET"]);
export type TestPackMethod = z.infer<typeof TestPackMethodSchema>;

// --- Evidence ---

export const EvidenceArtifactKindSchema = z.enum([
  "redacted_request",
  "redacted_response",
  "browser_screenshot",
  "runner_stdout",
  "containment",
  "oracle",
  "code_reference",
]);
export type EvidenceArtifactKind = z.infer<typeof EvidenceArtifactKindSchema>;

export const EvidenceStorageKindSchema = z.enum(["db", "object"]);
export type EvidenceStorageKind = z.infer<typeof EvidenceStorageKindSchema>;

// --- Containment ---

export const ContainmentRuleIdSchema = z.enum([
  "network.egress_denied",
  "filesystem.access_denied",
  "resource.limit_enforced",
  "process.limit_enforced",
  "secret.access_denied",
]);
export type ContainmentRuleId = z.infer<typeof ContainmentRuleIdSchema>;

// --- Findings ---

export const FindingCategorySchema = z.enum(["broken_object_authorization"]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

/** Risk impact — independent axis from confidence. */
export const SeveritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);
export type Severity = z.infer<typeof SeveritySchema>;

/** Evidentiary strength — independent axis from severity. */
export const ConfidenceSchema = z.enum([
  "suspected",
  "supported_by_analysis",
  "confirmed_by_execution",
  "not_reproduced",
  "inconclusive",
]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Fix workflow position — independent axis from severity/confidence. */
export const RemediationStatusSchema = z.enum([
  "open",
  "in_progress",
  "pending_verification",
  "verified_fixed",
  "accepted_risk",
  "dismissed",
  "reopened",
]);
export type RemediationStatus = z.infer<typeof RemediationStatusSchema>;

/** Triage may move a finding anywhere except `verified_fixed`, which only the
 * replay oracle can award (replay: baseline pass + cross-account denial). */
export const TriageTargetStatusSchema = RemediationStatusSchema.exclude([
  "verified_fixed",
]);
export type TriageTargetStatus = z.infer<typeof TriageTargetStatusSchema>;

export const RemediationRecordStatusSchema = z.enum([
  "suggested",
  "applied",
  "pending_verification",
  "verified",
  "failed",
]);
export type RemediationRecordStatus = z.infer<
  typeof RemediationRecordStatusSchema
>;

// --- Replay / verification ---

export const ReplayVerdictSchema = z.enum([
  "verified_fixed",
  "still_vulnerable",
  "regression",
  "inconclusive",
]);
export type ReplayVerdict = z.infer<typeof ReplayVerdictSchema>;

// --- Inference ---

export const ModelProviderSchema = z.enum(["vultr"]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelPurposeSchema = z.enum([
  "hypothesis",
  "test_plan",
  "threat_model",
  "remediation_guidance",
]);
export type ModelPurpose = z.infer<typeof ModelPurposeSchema>;

export const ModelCallOutcomeSchema = z.enum([
  "success",
  "malformed",
  "policy_conflict",
  "timeout",
  "rate_limited",
  "error",
]);
export type ModelCallOutcome = z.infer<typeof ModelCallOutcomeSchema>;

export const ProposalValidationStatusSchema = z.enum(["valid", "invalid"]);
export type ProposalValidationStatus = z.infer<
  typeof ProposalValidationStatusSchema
>;

// --- Sandbox / runner ---

export const RunnerStatusSchema = z.enum([
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
export type RunnerStatus = z.infer<typeof RunnerStatusSchema>;

export const SandboxResultStatusSchema = z.enum([
  "completed",
  "timeout",
  "failed",
  "killed",
]);
export type SandboxResultStatus = z.infer<typeof SandboxResultStatusSchema>;

// --- Queue jobs ---

export const JobTypeSchema = z.enum([
  "scan.plan_and_execute",
  "scan.cancel_and_cleanup",
  "scan.finalize",
  "replay.execute",
  "sandbox.orphan_reap",
  "evidence.retention_cleanup",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

// --- API errors ---

export const ApiErrorCodeSchema = z.enum([
  "validation_error",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "unprocessable",
  "rate_limited",
  "internal",
  "unavailable",
  "scope_denied",
  "policy_denied",
  "stale_revision",
  "quota_exceeded",
  "idempotency_conflict",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
