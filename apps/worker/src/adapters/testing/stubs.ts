/**
 * Scriptable port stubs for unit tests. Each records calls so tests can
 * assert what the orchestrator actually asked the dependency to do.
 */
import { randomUUID } from "node:crypto";
import { evaluateAttemptVerdict, evaluateReplayVerdict, type Scan } from "@highcastle/contracts";
import type {
  AttemptAdjudication,
  AttemptObservations,
  HypothesisInput,
  HypothesisOutcome,
  InferencePlanner,
  JobQueue,
  PlanAuthorizationRequest,
  PlanDecision,
  PolicyGate,
  ReapReport,
  SandboxExecutor,
  SandboxRunOutcome,
  AttemptVerifier,
  EnqueueOptions,
} from "../ports.js";
import { CONTRACT_SCHEMA_VERSION } from "@highcastle/contracts";

export const WS = randomUUID();
export const PROJECT = randomUUID();
export const TARGET = randomUUID();
export const ENV_VULN = randomUUID();
export const ENV_PATCHED = randomUUID();
export const SCOPE = randomUUID();
export const USER = randomUUID();
export const IDENTITY_ALICE = randomUUID();
export const SCOPE_HASH = "a".repeat(64);
export const IMG_DIGEST = "target-lab@sha256:" + "b".repeat(64);

export function makeScope(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: SCOPE,
    workspaceId: WS,
    projectId: PROJECT,
    targetId: TARGET,
    version: 1,
    actorUserId: USER,
    status: "active",
    allowedHosts: ["target-lab"],
    allowedPaths: [
      "/api/invoices/invoice_A",
      "/api/invoices/invoice_B",
      "/api/meta",
      "/api/auth/whoami",
    ],
    deniedPaths: [],
    allowedTestPackIds: ["bola-invoice-v1"],
    allowedMethods: ["GET"],
    maxDurationSeconds: 120,
    maxRequests: 16,
    maxConcurrency: 1,
    maxMemoryMb: 512,
    networkProfileId: "net-lab",
    permittedEnvironmentId: ENV_VULN,
    approvedAt: new Date(now.getTime() - 3600_000).toISOString(),
    expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
    scopeHash: SCOPE_HASH,
    ...overrides,
  } as never;
}

export function makeScan(overrides: Record<string, unknown> = {}): Scan {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceId: WS,
    projectId: PROJECT,
    scopeId: SCOPE,
    sourceSnapshotRef: "src@deadbeef",
    targetId: TARGET,
    environmentId: ENV_VULN,
    targetRevision: "lab-v1-vulnerable",
    fixtureVersion: "1.0.0",
    scanType: "targeted_red_team",
    testPackIds: ["bola-invoice-v1"],
    testPackVersions: { "bola-invoice-v1": "1.0.0" },
    requestedByUserId: USER,
    idempotencyKey: null,
    status: "queued",
    phase: null,
    planVersion: null,
    plannedCount: 0,
    executedCount: 0,
    confirmedCount: 0,
    startedAt: null,
    endedAt: null,
    cancelRequestedAt: null,
    failureCode: null,
    publicDemo: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as Scan;
}

export function makeProject() {
  const now = new Date().toISOString();
  return {
    id: PROJECT,
    workspaceId: WS,
    slug: "demo-lab",
    name: "Demo Lab",
    description: null,
    kind: "demo",
    lifecycle: "ready",
    createdBy: USER,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  } as never;
}

export function makeTarget() {
  return {
    id: TARGET,
    workspaceId: WS,
    projectId: PROJECT,
    environmentId: ENV_VULN,
    label: "Invoice lab",
    canonicalOrigin: "https://target-lab.internal",
    targetKind: "demo",
    state: "verified",
    verificationStatus: "verified",
    verificationMethod: "synthetic_lab_attestation",
    verifiedBy: USER,
    verifiedAt: new Date().toISOString(),
    verificationExpiresAt: null,
  } as never;
}

export function makeEnvironment(envId: string, revision: string) {
  const now = new Date().toISOString();
  return {
    id: envId,
    workspaceId: WS,
    projectId: PROJECT,
    label: `lab-${revision}`,
    kind: "attack_twin",
    currentRevision: revision,
    fixtureVersion: "1.0.0",
    provisionStatus: "ready",
    networkProfileId: "net-lab",
    createdAt: now,
    destroyedAt: null,
  } as never;
}

export function makeIdentity() {
  return {
    id: IDENTITY_ALICE,
    workspaceId: WS,
    environmentId: ENV_VULN,
    label: "Alice",
    role: "alice",
    synthetic: true,
    fixtureSubjectId: "user_A",
    active: true,
  } as never;
}

// ---------------------------------------------------------------- legs ---

export function leg(
  status: number,
  body: unknown,
  revisionEcho: string | null = "lab-v1-vulnerable",
) {
  return { status, bodyText: JSON.stringify(body ?? ""), body, revisionEcho };
}

/** The five legs L15's oracle adjudicates over. */
export function makeObservations(overrides: {
  attemptId: string;
  revision?: string;
  ownStatus?: number;
  crossStatus?: number;
  crossBody?: unknown;
}): AttemptObservations {
  const rev = overrides.revision ?? "lab-v1-vulnerable";
  return {
    attemptId: overrides.attemptId,
    expectedRevision: rev,
    health: leg(200, { ok: true }, rev),
    ready: leg(200, { ready: true }, rev),
    meta: leg(
      200,
      { fixtureSet: "alice-bob-invoices", fixtureVersion: "1.0.0", revision: rev },
      rev,
    ),
    ownInvoice: leg(
      overrides.ownStatus ?? 200,
      { invoice: { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A", number: "INV-001" } },
      rev,
    ),
    crossInvoice: leg(
      overrides.crossStatus ?? 200,
      overrides.crossBody ?? {
        invoice: { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B", number: "INV-002" },
      },
      rev,
    ),
  };
}

// ------------------------------------------------------------- stubs ---

export class StubInference implements InferencePlanner {
  calls: HypothesisInput[] = [];
  constructor(private outcomes: Array<HypothesisOutcome | Error>) {}
  async generateHypothesis(input: HypothesisInput): Promise<HypothesisOutcome> {
    this.calls.push(input);
    const next =
      this.outcomes[Math.min(this.calls.length - 1, this.outcomes.length - 1)] ??
      validProposalOutcome();
    if (next instanceof Error) throw next;
    return next;
  }
}

export function validProposalOutcome(): HypothesisOutcome {
  return {
    proposal: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      hypothesis: {
        category: "broken_object_authorization",
        targetComponent: "invoice_lookup",
        reason: "Ownership check may be absent",
        expectedSecureBehavior: "A customer cannot read another customer's invoice",
      },
      requestedTest: {
        packId: "bola-invoice-v1",
        objective: "Probe cross-account invoice read",
      },
    },
    validationStatus: "valid",
    rejectionCode: null,
    issues: [],
    rawProposalRedacted: { note: "redacted" },
    metadata: {
      provider: "vultr",
      model: "test-model",
      requestId: "req-1",
      latencyMs: 120,
      tokensInput: 100,
      tokensOutput: 40,
      outcome: "success",
      errorCode: null,
    },
  };
}

export function invalidProposalOutcome(
  rejectionCode: HypothesisOutcome["rejectionCode"] = "schema_mismatch",
): HypothesisOutcome {
  return {
    ...validProposalOutcome(),
    proposal: null,
    validationStatus: "invalid",
    rejectionCode,
    issues: ["missing required field: hypothesis"],
    metadata: {
      ...validProposalOutcome().metadata,
      outcome: "malformed",
      errorCode: "invalid_json",
    },
  };
}

export class StubPolicy implements PolicyGate {
  calls: PlanAuthorizationRequest[] = [];
  constructor(private decision: PlanDecision) {}
  async authorizePlan(input: PlanAuthorizationRequest): Promise<PlanDecision> {
    this.calls.push(input);
    return this.decision;
  }
}

export const ALLOW_DECISION: PlanDecision = {
  allowed: true,
  policyVersion: "l04-policy-1.0.0",
  policyHash: SCOPE_HASH,
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  targetServiceAlias: "target-lab",
  permittedMethods: ["GET"],
  limits: {
    maxDurationSeconds: 30,
    maxRequests: 8,
    maxMemoryMb: 512,
    maxCpuMillicores: 1000,
    maxPids: 64,
  },
  expiresAt: new Date(Date.now() + 3600_000),
  reasons: [],
};

export function denyDecision(codes: string[] = ["out_of_scope_pack"]): PlanDecision {
  return {
    allowed: false,
    policyVersion: "l04-policy-1.0.0",
    policyHash: SCOPE_HASH,
    reasons: codes.map((code) => ({ code, detail: `denied: ${code}` })),
  };
}

export class StubSandbox implements SandboxExecutor {
  calls: { request: unknown; signal: AbortSignal | undefined }[] = [];
  canceled: string[] = [];
  constructor(
    private outcome:
      SandboxRunOutcome | ((call: number) => SandboxRunOutcome | Promise<SandboxRunOutcome>),
  ) {}
  async execute(
    request: Parameters<SandboxExecutor["execute"]>[0],
    ctx: { workspaceId: string; signal?: AbortSignal | undefined },
  ): Promise<SandboxRunOutcome> {
    this.calls.push({ request, signal: ctx.signal });
    if (typeof this.outcome === "function") return this.outcome(this.calls.length);
    return this.outcome;
  }
  async cancel(runnerId: Parameters<SandboxExecutor["cancel"]>[0]) {
    this.canceled.push(runnerId as string);
  }
  async reconcileOrphans(): Promise<ReapReport> {
    return {
      inspected: 3,
      reaped: [{ containerId: "c1", runnerId: "r1" }],
      markedLost: [],
      errors: [],
    };
  }
}

export function executedOutcome(opts: {
  attemptId: string;
  observations?: AttemptObservations | null;
  resultStatus?: "completed" | "timeout" | "failed";
}): SandboxRunOutcome {
  return {
    kind: "executed",
    runnerId: randomUUID() as never,
    outcome: opts.resultStatus ?? "completed",
    result: null,
    observations:
      opts.observations === undefined
        ? makeObservations({ attemptId: opts.attemptId })
        : opts.observations,
    containmentEvents: [],
    exitCode: 0,
    resultError: null,
  };
}

/**
 * Deterministic verifier built on the CONTRACT verdict matrix — the same
 * logic L15's oracle implements. Tests therefore exercise real verdict
 * semantics (baseline pass + cross fail => reproduced, etc.).
 */
export class ContractVerifier implements AttemptVerifier {
  calls: AttemptObservations[] = [];
  constructor(private fixed?: AttemptAdjudication) {}
  async adjudicate(obs: AttemptObservations): Promise<AttemptAdjudication> {
    this.calls.push(obs);
    if (this.fixed) return this.fixed;
    const baseline = obs.ownInvoice.status === 200 ? "pass" : ("unknown" as const);
    const securityCheck =
      obs.crossInvoice.status === 200
        ? "fail"
        : obs.crossInvoice.status === 403 || obs.crossInvoice.status === 404
          ? "pass"
          : "unknown";
    const verdict = evaluateAttemptVerdict({ baseline, securityCheck });
    return {
      attemptId: obs.attemptId,
      oracleVersion: "bola-oracle-v1",
      baseline,
      securityCheck,
      verdict,
      preconditionsOk: obs.meta.status === 200,
      reasons: [`baseline=${baseline}`, `security=${securityCheck}`],
    };
  }
  async adjudicateReplay(patched: AttemptAdjudication) {
    const replayVerdict = evaluateReplayVerdict({
      legitimateRead: patched.baseline,
      unauthorizedReadDenied: patched.securityCheck,
      stillReadsCrossAccount: patched.verdict === "reproduced",
    });
    return { replayVerdict };
  }
}

export class InMemoryQueue implements JobQueue {
  sent: { name: string; payload: object; options: EnqueueOptions | undefined }[] = [];
  async send(name: string, payload: object, options?: EnqueueOptions | undefined) {
    this.sent.push({ name, payload, options });
    return randomUUID();
  }
}
