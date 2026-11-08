/**
 * Orchestrator ports — the typed seams between L16 flow code and the
 * dependency lanes. Flow code (`../flows/**`) speaks ONLY to these
 * interfaces; every production adapter is a thin binding over the real
 * package, and unit tests substitute in-memory implementations.
 *
 * Binding map (each documents the merged package + call it wraps):
 * - `OrchestratorStore`      -> @highcastle/db repo functions (PR #18)
 * - `InferencePlanner`       -> @highcastle/inference `VultrInferenceClient`
 *                              .generateHypothesis (PR #16)
 * - `PolicyGate`             -> @highcastle/security
 *                              `evaluatePlanAuthorization` (PR #14)
 * - `SandboxExecutor`        -> @highcastle/sandbox `SandboxController`
 *                              .execute / .cancel / .reconcileOrphans (PR #15)
 * - `AttemptVerifier`        -> @highcastle/test-packs `adjudicateAttempt` /
 *                              `adjudicateReplay` (PR #17)
 * - `ScanEventPublisher`     -> @highcastle/db `appendScanEvent` (PR #18);
 *                              L17 will add SSE fan-out on the same rows.
 * - `JobQueue`               -> pg-boss (real, `../jobs/pg-boss-queue.ts`)
 *
 * Nothing below may fabricate evidence. A port either returns real
 * observations/decisions or reports that it cannot; the flows treat
 * "cannot observe" as inconclusive, never as confirmation.
 */

import type { AuthorizedModelProgram } from "@highcastle/sandbox";
import type {
  ActorType,
  AgentProposal,
  AuthorizationScope,
  ContainmentEvent,
  CredentialRef,
  Environment,
  ModelCall,
  ModelProposal,
  OracleVerdict,
  Project,
  ReplayVerdict,
  RunnerInstanceId,
  SafeSummary,
  SandboxRequest,
  SandboxResult,
  Scan,
  ScanEvent,
  ScanEventType,
  ScanPhase,
  ScopeHash,
  Target,
  TestIdentity,
} from "@highcastle/contracts";

// ---------------------------------------------------------------- clock ---

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/**
 * Mirrors L02's `ScanTransition` (packages/db, PR #18) — kept local so this
 * file compiles against contracts alone. Shape is identical by convention;
 * the real adapter passes it through unmodified.
 */
export interface ScanTransitionInput {
  to:
    | "draft"
    | "preflight"
    | "awaiting_approval"
    | "queued"
    | "preparing"
    | "recon"
    | "planning"
    | "executing"
    | "verifying"
    | "finalizing"
    | "completed"
    | "partial"
    | "failed"
    | "canceled";
  phase?: ScanPhase | null;
  planVersion?: number | null;
  plannedCount?: number;
  executedCount?: number;
  confirmedCount?: number;
  failureCode?: string | null;
}

// -------------------------------------------------- persistence (L02) ---
//
// Row shapes below are the *orchestrator's* required projections. The real
// adapter returns L02's wider rows; structural typing carries the subset.
// `Scan`, `AuthorizationScope`, `Project`, `Target`, `Environment`,
// `TestIdentity`, `ModelCall`, `AgentProposal`, `ScanEvent`,
// `ContainmentEvent` are the frozen contract types.

/** Attempt row projection the orchestrator reads/writes. */
export interface AttemptRecord {
  id: string;
  workspaceId: string;
  scanId: string;
  packId: string;
  packVersion: string;
  proposalId: string | null;
  planHash: string;
  scopeHash: string;
  attemptNumber: number;
  status:
    | "proposed"
    | "validated"
    | "blocked"
    | "queued"
    | "running"
    | "completed"
    | "timeout"
    | "failed"
    | "canceled";
  oracleVersion: string | null;
  verifierVerdict: OracleVerdict | null;
  verdictReasonCode: string | null;
  positiveControlPassed: boolean | null;
  negativeSecurityConditionMet: boolean | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface FindingRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  stableFingerprint: string;
  confidence: string;
  remediationStatus: string;
}

export interface ReplayRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  findingId: string;
  originalAttemptId: string;
  originalScanId: string;
  replayScanId: string | null;
  patchedEnvironmentId: string | null;
  patchedRevision: string;
  packId: string;
  packVersion: string;
  approvalScopeId: string | null;
  verdict: ReplayVerdict | null;
}

export interface CreateAttemptInput {
  workspaceId: string;
  scanId: string;
  packId: string;
  packVersion: string;
  proposalId: string | null;
  planHash: string;
  scopeHash: string;
  actorIdentityId?: string | null;
  targetRevision: string;
  attemptNumber?: number;
}

export interface VerdictRecord {
  oracleVersion: string;
  verdict: OracleVerdict;
  reasonCode?: string | null;
  positiveControlPassed?: boolean | null;
  negativeSecurityConditionMet?: boolean | null;
}

export interface UpsertFindingInput {
  workspaceId: string;
  projectId: string;
  stableFingerprint: string;
  title: string;
  summary: string;
  category: "broken_object_authorization";
  severity: "critical" | "high" | "medium" | "low" | "informational";
  confidence:
    | "suspected"
    | "supported_by_analysis"
    | "confirmed_by_execution"
    | "not_reproduced"
    | "inconclusive";
  scanId: string;
  attemptId?: string | null;
  sourceRevision?: string | null;
  targetRevision: string;
  oracleVerdict: OracleVerdict;
}

export interface UpsertFindingResult {
  finding: FindingRecord;
  created: boolean;
}

/**
 * Mirrors L02's `ReplayOracleEvidence` — the persisted-oracle contract for
 * replay completion. `oracleEvidenceId` must name a stored `oracle`
 * evidence artifact for the replay scan's attempt; preconditionsOk is the
 * verifier's true P0/P2 status, not a proxy boolean.
 */
export interface ReplayOracleEvidenceInput {
  oracleEvidenceId: string;
  oracleVersion: string;
  baseline: "pass" | "fail" | "unknown";
  securityCheck: "pass" | "fail" | "unknown";
  attemptVerdict: "reproduced" | "not_reproduced" | "inconclusive";
  preconditionsOk: boolean;
}

export interface CreateReplayScanInput {
  workspaceId: string;
  projectId: string;
  scopeId: string;
  targetId: string;
  environmentId: string;
  targetRevision: string;
  fixtureVersion: string | null;
  testPackIds: string[];
  testPackVersions: Record<string, string>;
  requestedByUserId: string;
  idempotencyKey?: string | null;
}

/**
 * Durable persistence port. Every method maps 1:1 onto an L02 repo call
 * (`packages/db/src/repos/*`). The store enforces the state machines,
 * write-once verdicts and tenant scoping — the port never does those itself.
 */
export interface OrchestratorStore {
  getScan(workspaceId: string, scanId: string): Promise<Scan | null>;
  /** CAS move through the legal transition table; conflicts throw. */
  transitionScan(
    workspaceId: string,
    scanId: string,
    transition: ScanTransitionInput,
  ): Promise<Scan>;
  /** Set the cancel flag observed by running flows. */
  requestScanCancel(workspaceId: string, scanId: string): Promise<Scan>;
  getScope(workspaceId: string, scopeId: string): Promise<AuthorizationScope | null>;
  getProject(workspaceId: string, projectId: string): Promise<Project | null>;
  getTarget(workspaceId: string, targetId: string): Promise<Target | null>;
  getEnvironment(workspaceId: string, environmentId: string): Promise<Environment | null>;
  /** Synthetic fixture identity for the acting role (Alice). */
  getTestIdentity(
    workspaceId: string,
    environmentId: string,
    role: "alice" | "bob",
  ): Promise<TestIdentity | null>;

  createAttempt(input: CreateAttemptInput): Promise<AttemptRecord>;
  getAttempt(workspaceId: string, attemptId: string): Promise<AttemptRecord | null>;
  /** Idempotent re-fetch for resume: attempt by (scanId, planHash). */
  findAttemptByPlanHash(
    workspaceId: string,
    scanId: string,
    planHash: string,
  ): Promise<AttemptRecord | null>;
  updateAttemptStatus(
    workspaceId: string,
    attemptId: string,
    status: AttemptRecord["status"],
  ): Promise<AttemptRecord>;
  /** Write-once oracle verdict; second write throws conflict. */
  recordAttemptVerdict(
    workspaceId: string,
    attemptId: string,
    verdict: VerdictRecord,
  ): Promise<AttemptRecord>;
  listAttempts(workspaceId: string, scanId: string): Promise<AttemptRecord[]>;

  recordModelCall(input: Omit<ModelCall, "id">): Promise<ModelCall>;
  recordAgentProposal(input: Omit<AgentProposal, "id">): Promise<AgentProposal>;
  /** Latest proposal row for resume — used to skip re-calling the model. */
  findLatestProposal(workspaceId: string, scanId: string): Promise<AgentProposal | null>;

  upsertFindingFromVerdict(input: UpsertFindingInput): Promise<UpsertFindingResult>;
  getFinding(workspaceId: string, findingId: string): Promise<FindingRecord | null>;

  createReplay(input: {
    workspaceId: string;
    projectId: string;
    findingId: string;
    originalAttemptId: string;
    originalScanId: string;
    replayScanId?: string | null;
    patchedEnvironmentId?: string | null;
    patchedRevision: string;
    packId: string;
    packVersion: string;
    approvalScopeId?: string | null;
  }): Promise<ReplayRecord>;
  getReplay(workspaceId: string, replayId: string): Promise<ReplayRecord | null>;

  /**
   * Persist `replay_scan_id` on the replay row after the worker opens the
   * execution scan. L02's `completeReplay` refuses to complete a replay
   * that has no linked execution scan — this write is required, not
   * optional, and must happen before completion is attempted.
   */
  linkReplayScan(
    workspaceId: string,
    replayId: string,
    replayScanId: string,
  ): Promise<ReplayRecord>;
  /** Derives the verdict from observations; flips finding on verified_fixed. */
  completeReplay(
    workspaceId: string,
    replayId: string,
    evidence: ReplayOracleEvidenceInput,
  ): Promise<ReplayRecord>;

  /** Create the `replay_verification` scan a replay job executes under. */
  createReplayScan(input: CreateReplayScanInput): Promise<Scan>;

  createEvidenceArtifact(input: {
    workspaceId: string;
    scanId: string;
    attemptId: string | null;
    artifactKind:
      | "redacted_request"
      | "redacted_response"
      | "browser_screenshot"
      | "runner_stdout"
      | "containment"
      | "oracle"
      | "code_reference";
    storageKind: "db" | "object";
    storageKey: string;
    sha256: string;
    byteSize: number;
    contentType: string;
    retentionUntil?: Date | null;
  }): Promise<{ id: string }>;
  recordContainmentEvent(event: ContainmentEvent): Promise<void>;

  /** Runner rows for janitor/cancel paths. */
  listActiveRunnerIds(workspaceId: string, scanId: string): Promise<RunnerInstanceId[]>;

  /**
   * Persisted evidence artifacts for one attempt, workspace-scoped.
   * The explanation service (E8) cites only these rows — never
   * caller-supplied IDs and never raw response bodies.
   */
  listEvidenceForAttempt(
    workspaceId: string,
    scanId: string,
    attemptId: string,
  ): Promise<EvidenceArtifactRef[]>;
  /**
   * Persist a validated post-oracle explanation. The L02 repo verifies
   * attempt/evidence linkage and verdict equality — this write cannot
   * change the oracle result.
   */
  recordExplanation(input: RecordExplanationInput): Promise<ExplanationRecord>;
}

/** Minimal persisted-evidence shape for explanation grounding. */
export interface EvidenceArtifactRef {
  id: string;
  workspaceId: string;
  scanId: string;
  attemptId: string | null;
  artifactKind: string;
  sha256: string;
  byteSize: number;
}

export interface RecordExplanationInput {
  workspaceId: string;
  scanId: string;
  attemptId: string;
  /** Must all be persisted rows for this workspace/scan/attempt. */
  evidenceIds: string[];
  requestedModel: string;
  responseModel?: string | null;
  requestId?: string | null;
  latencyMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  outcome: "success" | "malformed" | "policy_conflict" | "timeout" | "rate_limited" | "error";
  errorCode?: string | null;
  oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
  replayVerdict?: "verified_fixed" | "still_vulnerable" | "regression" | "inconclusive" | null;
  explanation?: unknown;
  rawExplanationRedacted: unknown;
}

export interface ExplanationRecord {
  id: string;
  attemptId: string;
  oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
}

// ----------------------------------------------------- events (L17) ---

export interface PublishScanEventInput {
  workspaceId: string;
  scanId: string;
  eventType: ScanEventType;
  phase: ScanPhase | null;
  actorType: ActorType;
  safeSummary: SafeSummary;
  payloadRedacted?: Record<string, unknown> | undefined;
  attemptId?: string | null | undefined;
}

/**
 * Durable event append (monotonic seq per scan). Today this is L02's
 * `appendScanEvent`; when L17 lands it owns fan-out/notify on the same rows
 * — flow code must not depend on streaming, only on persistence.
 */
export interface ScanEventPublisher {
  publish(input: PublishScanEventInput): Promise<ScanEvent>;
}

// ------------------------------------------------- inference (L12) ---

/** Sanitized prompt context; caller redacts before constructing. */
export interface HypothesisInput {
  sanitizedSourceContext: string;
  scopeSummary: string;
  routeSummary?: string;
  packVersion?: string;
}

export interface ModelCallMeta {
  provider: "vultr";
  model: string;
  requestId: string | null;
  latencyMs: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  outcome: "success" | "malformed" | "policy_conflict" | "timeout" | "rate_limited" | "error";
  errorCode: string | null;
}

export interface HypothesisOutcome {
  proposal: ModelProposal | null;
  validationStatus: "valid" | "invalid";
  rejectionCode:
    | "schema_mismatch"
    | "unknown_pack"
    | "out_of_scope_pack"
    | "forbidden_field"
    | "stale_version"
    | "empty_proposal"
    | null;
  issues: string[];
  rawProposalRedacted: unknown;
  metadata: ModelCallMeta;
}

/**
 * Structured Vultr hypothesis. Binding:
 * `VultrInferenceClient.generateHypothesis` (packages/inference, PR #16).
 * A transport failure THROWS — the flow decides whether it is retryable.
 * A malformed answer returns in the outcome, never throws.
 */
export interface InferencePlanner {
  generateHypothesis(input: HypothesisInput): Promise<HypothesisOutcome>;
}

// ---------------------------------------------------- policy (L04) ---

export interface PlanAuthorizationRequest {
  scope: unknown;
  project: unknown;
  target: unknown;
  environment: unknown;
  proposal: unknown;
  operatorCaps?: unknown;
  now?: Date;
}

export interface EffectiveLimits {
  maxDurationSeconds: number;
  maxRequests: number;
  maxMemoryMb: number;
  maxCpuMillicores: number;
  maxPids: number;
}

export interface PolicyDenial {
  code: string;
  detail: string;
}

export type PlanDecision =
  | {
      allowed: true;
      policyVersion: string;
      policyHash: ScopeHash;
      packId: string;
      packVersion: string;
      targetServiceAlias: string;
      permittedMethods: readonly string[];
      limits: EffectiveLimits;
      expiresAt: Date;
      reasons: readonly PolicyDenial[];
    }
  | {
      allowed: false;
      policyVersion: string;
      policyHash: ScopeHash | null;
      reasons: readonly PolicyDenial[];
    };

/**
 * Deterministic plan authorization. Binding:
 * `evaluatePlanAuthorization` (packages/security, PR #14) — its
 * `PolicyDecision` union maps directly onto `PlanDecision`.
 */
export interface PolicyGate {
  authorizePlan(input: PlanAuthorizationRequest): Promise<PlanDecision>;
}

// --------------------------------------------------- sandbox (L14) ---

/**
 * Per-leg observed HTTP fact — mirrors `ObservedHttpResponse` in
 * packages/test-packs (PR #17). `body`/`bodyText` carry ONLY sanitized
 * projections (the lab's small JSON), never headers or secrets.
 */
export interface ObservedLeg {
  status: number;
  bodyText: string;
  body: unknown;
  revisionEcho: string | null;
}

/**
 * The complete observed record the trusted oracle needs for one attempt —
 * same shape L15 calls `BolaAttemptInput`.
 *
 * KNOWN CROSS-LANE GAP (tracked on PRs #15/#17): the current L14 runner
 * protocol emits exchange hashes/excerpts and two runner-side booleans —
 * NOT these parsed observations. Until the protocol grows an `observation`
 * channel (or the in-image pack becomes L15's `runBolaPack` and returns its
 * `PackRunResult`), a sandbox adapter cannot produce `observations` — and
 * the flow must then record the attempt inconclusive, never confirmed.
 */
export interface AttemptObservations {
  attemptId: string;
  expectedRevision: string;
  health: ObservedLeg;
  ready: ObservedLeg;
  meta: ObservedLeg;
  /** P1: Alice reads her own invoice. */
  ownInvoice: ObservedLeg;
  /** S1: Alice attempts Bob's invoice. */
  crossInvoice: ObservedLeg;
}

export type SandboxRunOutcome =
  | {
      kind: "denied";
      /** Deterministic policy denial inside the controller boundary. */
      reason: string;
      policyVersion: string;
    }
  | { kind: "precondition_failed"; reason: string }
  | {
      kind: "executed";
      runnerId: RunnerInstanceId;
      outcome: "completed" | "timeout" | "failed" | "killed" | "containment_breach";
      /** Validated runner result; null when the runner produced none. */
      result: SandboxResult | null;
      /**
       * Oracle adjudication produced inside a trusted executor (L15's
       * `runBolaPack` adjudicates on real parsed legs in-process). When
       * present, flows use it directly — it is oracle output, not a
       * runner-supplied boolean.
       */
      adjudication?: AttemptAdjudication;
      /**
       * Parsed per-leg observations for the oracle — null when the runner
       * protocol cannot supply them (see AttemptObservations note). A null
       * here makes the attempt inconclusive BY CONSTRUCTION; no code path
       * may substitute runner booleans for this.
       */
      observations: AttemptObservations | null;
      /**
       * Pattern A provenance + real execution outcome, present when a
       * model-authored program was dispatched. `result` is the guest's
       * actual bounded output — evidence, never a verdict.
       */
      program?: {
        sha256: string;
        model: string;
        generatedAt: string;
        result: {
          status: "ok" | "program_error" | "budget_exceeded" | "timeout" | "denied";
          output: string;
          requestsMade: number;
          durationMs: number;
        } | null;
      };
      containmentEvents: ContainmentEvent[];
      exitCode: number | null;
      resultError: string | null;
    };

export interface ReapReport {
  inspected: number;
  reaped: { containerId: string; runnerId: string | null }[];
  markedLost: RunnerInstanceId[];
  errors: string[];
}

/**
 * Restricted executor. Binding: `SandboxController` (packages/sandbox,
 * PR #15): `execute(SandboxRequest, {workspaceId, signal})`,
 * `cancel(runnerId, reason)`, `reconcileOrphans(now)`.
 */
export interface SandboxExecutor {
  execute(
    request: SandboxRequest,
    ctx: {
      workspaceId: string;
      signal?: AbortSignal | undefined;
      /** Scan's pinned lab revision (expectedRevision for the pack run). */
      expectedRevision?: string | undefined;
      /**
       * Pattern A (issue #54): model-authored, sha-pinned program authorized
       * via `authorizeModelProgram`. Present ⇒ the runner executes it inside
       * the hardened container via the constrained `lab.get` API — never on
       * the host. Absent ⇒ the fixed built-in pack path (unchanged).
       */
      program?: AuthorizedModelProgram | undefined;
    },
  ): Promise<SandboxRunOutcome>;
  cancel(runnerId: RunnerInstanceId, reason: string): Promise<void>;
  reconcileOrphans(now?: Date): Promise<ReapReport>;
}

// ---------------------------------------------------- oracle (L15) ---

export interface AttemptAdjudication {
  attemptId: string;
  oracleVersion: string;
  baseline: "pass" | "fail" | "unknown";
  securityCheck: "pass" | "fail" | "unknown";
  verdict: OracleVerdict;
  preconditionsOk: boolean;
  reasons: string[];
}

/**
 * Independent deterministic oracle. Binding: `adjudicateAttempt` /
 * `adjudicateReplay` (packages/test-packs, PR #17). Pure functions — the
 * port stays synchronous-looking; async is only for adapter freedom.
 */
export interface AttemptVerifier {
  adjudicate(observations: AttemptObservations): Promise<AttemptAdjudication>;
  adjudicateReplay(patchedRun: AttemptAdjudication): Promise<{ replayVerdict: ReplayVerdict }>;
}

// --------------------------------------------------------- job queue ---

export interface EnqueueOptions {
  /** Deduplicates active/queued deliveries on this key (pg-boss singleton). */
  singletonKey?: string;
  priority?: number;
  startAfterSeconds?: number;
}

/**
 * Durable job transport. Real impl: pg-boss over the same Postgres
 * (`../jobs/pg-boss-queue.ts`). Flow code never constructs SQL.
 */
export interface JobQueue {
  send(name: string, payload: object, options?: EnqueueOptions | undefined): Promise<string | null>;
}

// -------------------------------------------------- actor credentials ---

/**
 * Opaque credential reference resolved by the sandbox controller — the
 * value itself never crosses this port. For H the acting role is always
 * `alice` (Bob is only the cross-account target).
 */
export type ActorCredentialRef = CredentialRef;
