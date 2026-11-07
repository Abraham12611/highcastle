/**
 * Production adapter bindings — blocked on unmerged dependency lanes.
 *
 * Each factory documents the EXACT binding it will make once the owning
 * package lands on `develop`. Until then it throws
 * `IntegrationBlockedError` at wire-up: the worker must never silently
 * substitute a fake store/policy/oracle in a real run.
 *
 * Blocked imports (tracked; rebase removes this file's throwers):
 * - #18 `packages/db`    -> repos: getScan, transitionScan, appendScanEvent,
 *    getScope, getProject/Target/Environment, createAttempt,
 *    updateAttemptStatus, recordAttemptVerdict, recordModelCall,
 *    recordAgentProposal, upsertFindingFromVerdict, createReplay,
 *    completeReplay, createReplayScan(via createScan), createEvidenceArtifact,
 *    recordContainmentEvent, getReplay, getFinding, getAttempt
 * - #14 `packages/security` -> evaluatePlanAuthorization
 * - #16 `packages/inference` -> VultrInferenceClient.generateHypothesis
 * - #15 `packages/sandbox`  -> SandboxController.execute/cancel/reconcileOrphans
 * - #17 `packages/test-packs` -> adjudicateAttempt / adjudicateReplay
 *
 * Event publishing stays with L02's durable `appendScanEvent`; L17 owns
 * fan-out and is coordinated via `apps/worker/src/events/**` (not ours).
 */
import { IntegrationBlockedError } from "./errors.js";
import type {
  AttemptVerifier,
  InferencePlanner,
  OrchestratorStore,
  PolicyGate,
  SandboxExecutor,
  ScanEventPublisher,
} from "./ports.js";

const BLOCKERS = {
  db: "PR #18 feature/l02-database",
  security: "PR #14 feature/l04-security-policy",
  inference: "PR #16 feature/l12-vultr-inference",
  sandbox: "PR #15 feature/l14-sandbox",
  testPacks: "PR #17 feature/l15-bola-pack",
} as const;

function throwBlocked(lane: string, blocker: string): never {
  throw new IntegrationBlockedError(lane, blocker);
}

/**
 * @highcastle/db-backed OrchestratorStore + event publisher.
 * Binding (post-merge): wrap `createDb({connectionString: DATABASE_URL})`
 * and delegate each port method to the repo functions listed above;
 * `findAttemptByPlanHash` -> select on (scan_id, plan_hash);
 * `findLatestProposal` -> latest `agent_proposals` by scan;
 * `listActiveRunnerIds` -> non-terminal `runner_instances` for the scan.
 */
export function createDbStore(): OrchestratorStore {
  return throwBlocked("@highcastle/db", BLOCKERS.db);
}

export function createDbEventPublisher(): ScanEventPublisher {
  return throwBlocked("@highcastle/db appendScanEvent", BLOCKERS.db);
}

/**
 * @highcastle/security-backed policy gate.
 * Binding (post-merge): `evaluatePlanAuthorization({scope, project, target,
 * environment, proposal, operatorCaps: DEFAULT_OPERATOR_CAPS, now})`,
 * mapping `PolicyDecision` (allow->ApprovedExecution) onto `PlanDecision`.
 */
export function createSecurityPolicyGate(): PolicyGate {
  return throwBlocked("@highcastle/security", BLOCKERS.security);
}

/**
 * @highcastle/inference-backed planner.
 * Binding (post-merge): `VultrInferenceClient.fromEnv()`.
 * `generateHypothesis(HypothesisInput)` — returns `HypothesisResult`;
 * transport failures surface as `VultrInferenceError` (retryable per
 * `isRetryableCode`) and are mapped to job-level retries by the flow.
 */
export function createInferencePlanner(): InferencePlanner {
  return throwBlocked("@highcastle/inference", BLOCKERS.inference);
}

/**
 * @highcastle/sandbox-backed executor.
 * Binding (post-merge): `SandboxController` with `DockerRuntime`,
 * `RunnerRegistry` (L02 rows), `CredentialResolver` (synthetic fixtures),
 * and an L04 `SandboxPolicyGate` adapter; `execute(req,{workspaceId,signal})`.
 * NOTE: see `AttemptObservations` — the runner protocol must expose parsed
 * per-leg observations before confirmed findings are possible.
 */
export function createSandboxExecutor(): SandboxExecutor {
  return throwBlocked("@highcastle/sandbox", BLOCKERS.sandbox);
}

/**
 * @highcastle/test-packs-backed oracle.
 * Binding (post-merge): `adjudicateAttempt(BolaAttemptInput)` /
 * `adjudicateReplay(BolaAttemptAdjudication)`.
 */
export function createAttemptVerifier(): AttemptVerifier {
  return throwBlocked("@highcastle/test-packs", BLOCKERS.testPacks);
}
