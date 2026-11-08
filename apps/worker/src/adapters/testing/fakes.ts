/**
 * In-memory port implementations — UNIT TEST ONLY, never wired in
 * production (adapters/blocked.ts + adapters/index.ts are the only prod
 * path and they throw until real packages land).
 *
 * The store re-implements the SAME transition table, CAS behavior,
 * idempotent attempt keys, monotonic event seq and write-once verdicts
 * as L02's repos — so flow tests exercise the real state machine
 * semantics, not a friendly version of them.
 */
import { randomUUID } from "node:crypto";
import { ScanStateConflictError } from "../errors.js";
import type {
  AgentProposal,
  AuthorizationScope,
  ContainmentEvent,
  Environment,
  ModelCall,
  Project,
  ReplayVerdict,
  Scan,
  ScanEvent,
  ScanStatus,
  Target,
  TestIdentity,
} from "@highcastle/contracts";
import type {
  AttemptRecord,
  CreateAttemptInput,
  CreateReplayScanInput,
  FindingRecord,
  OrchestratorStore,
  PublishScanEventInput,
  ReplayOracleEvidenceInput,
  ReplayRecord,
  ScanEventPublisher,
  ScanTransitionInput,
  UpsertFindingInput,
  UpsertFindingResult,
  VerdictRecord,
} from "../ports.js";

const TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["preflight", "canceled"],
  preflight: ["awaiting_approval", "queued", "canceled"],
  awaiting_approval: ["queued", "canceled"],
  queued: ["preparing", "canceled"],
  preparing: ["recon", "failed", "canceled"],
  recon: ["planning", "failed", "canceled"],
  planning: ["executing", "verifying", "failed", "canceled"],
  executing: ["verifying", "failed", "canceled"],
  verifying: ["planning", "finalizing", "completed", "partial", "failed", "canceled"],
  finalizing: ["completed", "partial", "failed", "canceled"],
  completed: [],
  partial: [],
  failed: [],
  canceled: [],
};

const TERMINAL = new Set<ScanStatus>(["completed", "partial", "failed", "canceled"]);
const TERMINAL_ATTEMPT = new Set(["completed", "timeout", "failed", "canceled", "blocked"]);

export class InMemoryStore implements OrchestratorStore {
  scans = new Map<string, Scan>();
  scopes = new Map<string, AuthorizationScope>();
  projects = new Map<string, Project>();
  targets = new Map<string, Target>();
  environments = new Map<string, Environment>();
  identities = new Map<string, TestIdentity>();
  attempts = new Map<string, AttemptRecord>();
  explanations = new Map<string, {
    id: string;
    workspaceId: string;
    scanId: string;
    attemptId: string;
    oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
  }>();
  modelCalls = new Map<string, ModelCall>();
  proposals = new Map<string, AgentProposal>();
  findings = new Map<string, FindingRecord>();
  replays = new Map<string, ReplayRecord>();
  evidence: {
    id: string;
    workspaceId: string;
    scanId: string;
    attemptId: string | null;
    artifactKind: string;
    sha256: string;
    byteSize: number;
  }[] = [];
  containment: ContainmentEvent[] = [];
  runners: { id: string; scanId: string; terminal: boolean }[] = [];

  async getScan(ws: string, id: string) {
    const s = this.scans.get(id);
    return s && s.workspaceId === ws ? s : null;
  }

  async transitionScan(ws: string, id: string, t: ScanTransitionInput) {
    const scan = await this.getScan(ws, id);
    if (!scan) throw new ScanStateConflictError(`scan ${id} not found`);
    if (TERMINAL.has(scan.status)) {
      throw new ScanStateConflictError(`scan terminal (${scan.status})`);
    }
    if (!TRANSITIONS[scan.status]?.includes(t.to)) {
      throw new ScanStateConflictError(`illegal ${scan.status} -> ${t.to}`);
    }
    const now = new Date().toISOString();
    const next: Scan = {
      ...scan,
      status: t.to,
      phase: t.phase !== undefined ? t.phase : scan.phase,
      planVersion: t.planVersion !== undefined ? t.planVersion : scan.planVersion,
      plannedCount: t.plannedCount ?? scan.plannedCount,
      executedCount: t.executedCount ?? scan.executedCount,
      confirmedCount: t.confirmedCount ?? scan.confirmedCount,
      failureCode: t.failureCode !== undefined ? t.failureCode : scan.failureCode,
      startedAt: scan.startedAt ?? (t.to !== "queued" ? now : null),
      endedAt: TERMINAL.has(t.to as ScanStatus) ? now : scan.endedAt,
      updatedAt: now,
    };
    this.scans.set(id, next);
    return next;
  }

  async requestScanCancel(ws: string, id: string) {
    const scan = await this.getScan(ws, id);
    if (!scan) throw new ScanStateConflictError(`scan ${id} not found`);
    const next = { ...scan, cancelRequestedAt: new Date().toISOString() };
    this.scans.set(id, next);
    return next;
  }

  async getScope(ws: string, id: string) {
    const s = this.scopes.get(id);
    return s && s.workspaceId === ws ? s : null;
  }
  async getProject(ws: string, id: string) {
    const p = this.projects.get(id);
    return p && p.workspaceId === ws ? p : null;
  }
  async getTarget(ws: string, id: string) {
    const t = this.targets.get(id);
    return t && t.workspaceId === ws ? t : null;
  }
  async getEnvironment(ws: string, id: string) {
    const e = this.environments.get(id);
    return e && e.workspaceId === ws ? e : null;
  }
  async getTestIdentity(ws: string, envId: string, role: "alice" | "bob") {
    return (
      [...this.identities.values()].find(
        (i) => i.workspaceId === ws && i.environmentId === envId && i.role === role,
      ) ?? null
    );
  }

  async createAttempt(input: CreateAttemptInput): Promise<AttemptRecord> {
    const existing = [...this.attempts.values()].find(
      (a) =>
        a.scanId === input.scanId &&
        a.planHash === input.planHash &&
        a.attemptNumber === (input.attemptNumber ?? 1),
    );
    if (existing) return existing;
    const attempt: AttemptRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      packId: input.packId,
      packVersion: input.packVersion,
      proposalId: input.proposalId,
      planHash: input.planHash,
      scopeHash: input.scopeHash,
      attemptNumber: input.attemptNumber ?? 1,
      status: "queued",
      oracleVersion: null,
      verifierVerdict: null,
      verdictReasonCode: null,
      positiveControlPassed: null,
      negativeSecurityConditionMet: null,
      startedAt: null,
      endedAt: null,
    };
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }

  async getAttempt(ws: string, id: string) {
    const a = this.attempts.get(id);
    return a && a.workspaceId === ws ? a : null;
  }

  async findAttemptByPlanHash(ws: string, scanId: string, planHash: string) {
    return (
      [...this.attempts.values()].find(
        (a) => a.workspaceId === ws && a.scanId === scanId && a.planHash === planHash,
      ) ?? null
    );
  }

  async updateAttemptStatus(ws: string, id: string, status: AttemptRecord["status"]) {
    const a = await this.getAttempt(ws, id);
    if (!a) throw new ScanStateConflictError(`attempt ${id} not found`);
    if (TERMINAL_ATTEMPT.has(a.status)) {
      throw new ScanStateConflictError(`attempt terminal (${a.status})`);
    }
    const next: AttemptRecord = {
      ...a,
      status,
      startedAt: a.startedAt ?? (status === "running" || status === "queued" ? new Date() : null),
      endedAt: TERMINAL_ATTEMPT.has(status) ? new Date() : a.endedAt,
    };
    this.attempts.set(id, next);
    return next;
  }

  async recordAttemptVerdict(ws: string, id: string, verdict: VerdictRecord) {
    const a = await this.getAttempt(ws, id);
    if (!a) throw new ScanStateConflictError(`attempt ${id} not found`);
    if (a.verifierVerdict !== null) {
      throw new ScanStateConflictError("attempt verdict already recorded");
    }
    const next: AttemptRecord = {
      ...a,
      status: "completed",
      oracleVersion: verdict.oracleVersion,
      verifierVerdict: verdict.verdict,
      verdictReasonCode: verdict.reasonCode ?? null,
      positiveControlPassed: verdict.positiveControlPassed ?? null,
      negativeSecurityConditionMet: verdict.negativeSecurityConditionMet ?? null,
      endedAt: a.endedAt ?? new Date(),
    };
    this.attempts.set(id, next);
    return next;
  }

  async listAttempts(ws: string, scanId: string) {
    return [...this.attempts.values()].filter((a) => a.workspaceId === ws && a.scanId === scanId);
  }

  async recordModelCall(input: Omit<ModelCall, "id">) {
    const row: ModelCall = { ...input, id: randomUUID() as ModelCall["id"] };
    this.modelCalls.set(row.id, row);
    return row;
  }

  async recordAgentProposal(input: Omit<AgentProposal, "id">) {
    const row: AgentProposal = { ...input, id: randomUUID() as AgentProposal["id"] };
    this.proposals.set(row.id, row);
    return row;
  }

  async findLatestProposal(ws: string, scanId: string) {
    return (
      [...this.proposals.values()]
        .filter((p) => p.workspaceId === ws && p.scanId === scanId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }

  async upsertFindingFromVerdict(input: UpsertFindingInput): Promise<UpsertFindingResult> {
    const existing = [...this.findings.values()].find(
      (f) => f.workspaceId === input.workspaceId && f.stableFingerprint === input.stableFingerprint,
    );
    if (existing) {
      return { finding: existing, created: false };
    }
    const finding: FindingRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      stableFingerprint: input.stableFingerprint,
      confidence: input.confidence,
      remediationStatus: "open",
    };
    this.findings.set(finding.id, finding);
    return { finding, created: true };
  }

  async getFinding(ws: string, id: string) {
    const f = this.findings.get(id);
    return f && f.workspaceId === ws ? f : null;
  }

  async createReplay(input: Parameters<OrchestratorStore["createReplay"]>[0]) {
    const replay: ReplayRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      findingId: input.findingId,
      originalAttemptId: input.originalAttemptId,
      originalScanId: input.originalScanId,
      replayScanId: input.replayScanId ?? null,
      patchedEnvironmentId: input.patchedEnvironmentId ?? null,
      patchedRevision: input.patchedRevision,
      packId: input.packId,
      packVersion: input.packVersion,
      approvalScopeId: input.approvalScopeId ?? null,
      verdict: null,
    };
    this.replays.set(replay.id, replay);
    return replay;
  }

  async linkReplayScan(ws: string, id: string, replayScanId: string) {
    const r = await this.getReplay(ws, id);
    if (!r) throw new ScanStateConflictError(`replay ${id} not found`);
    const next = { ...r, replayScanId };
    this.replays.set(id, next);
    return next;
  }

  async getReplay(ws: string, id: string) {
    const r = this.replays.get(id);
    return r && r.workspaceId === ws ? r : null;
  }

  async completeReplay(ws: string, id: string, evidence: ReplayOracleEvidenceInput) {
    const replay = await this.getReplay(ws, id);
    if (!replay) throw new ScanStateConflictError(`replay ${id} not found`);
    if (replay.verdict !== null) {
      throw new ScanStateConflictError("replay already completed");
    }
    // Mirrors L02's recompute-from-evidence gate incl. precondition force.
    let verdict: ReplayVerdict = "inconclusive";
    if (!evidence.preconditionsOk) verdict = "inconclusive";
    else if (evidence.attemptVerdict === "reproduced") verdict = "still_vulnerable";
    else if (evidence.securityCheck === "pass" && evidence.baseline === "pass")
      verdict = "verified_fixed";
    else if (evidence.securityCheck === "pass" && evidence.baseline === "fail")
      verdict = "regression";
    const next = { ...replay, verdict };
    this.replays.set(id, next);
    if (verdict === "verified_fixed") {
      const finding = this.findings.get(replay.findingId);
      if (finding)
        this.findings.set(finding.id, { ...finding, remediationStatus: "verified_fixed" });
    }
    return next;
  }

  async createReplayScan(input: CreateReplayScanInput) {
    const now = new Date().toISOString();
    const scan: Scan = {
      id: randomUUID() as Scan["id"],
      workspaceId: input.workspaceId as Scan["workspaceId"],
      projectId: input.projectId as Scan["projectId"],
      scopeId: input.scopeId as Scan["scopeId"],
      sourceSnapshotRef: null,
      targetId: input.targetId as Scan["targetId"],
      environmentId: input.environmentId as Scan["environmentId"],
      targetRevision: input.targetRevision,
      fixtureVersion: input.fixtureVersion as Scan["fixtureVersion"],
      scanType: "replay_verification",
      testPackIds: input.testPackIds as Scan["testPackIds"],
      testPackVersions: input.testPackVersions,
      requestedByUserId: input.requestedByUserId as Scan["requestedByUserId"],
      idempotencyKey: (input.idempotencyKey ?? null) as Scan["idempotencyKey"],
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
    };
    this.scans.set(scan.id, scan);
    return scan;
  }

  async createEvidenceArtifact(input: Parameters<OrchestratorStore["createEvidenceArtifact"]>[0]) {
    const id = randomUUID();
    this.evidence.push({
      id,
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      attemptId: input.attemptId,
      artifactKind: input.artifactKind,
      sha256: input.sha256,
      byteSize: input.byteSize ?? 0,
    });
    return { id };
  }

  async listEvidenceForAttempt(ws: string, scanId: string, attemptId: string) {
    return this.evidence.filter(
      (e) => e.workspaceId === ws && e.scanId === scanId && e.attemptId === attemptId,
    );
  }

  async recordExplanation(input: Parameters<OrchestratorStore["recordExplanation"]>[0]) {
    const attempt = [...this.attempts.values()].find(
      (a) => a.id === input.attemptId && a.workspaceId === input.workspaceId && a.scanId === input.scanId,
    );
    if (!attempt) throw new ScanStateConflictError(`attempt ${input.attemptId} not found`);
    if (attempt.verifierVerdict !== input.oracleVerdict) {
      throw new ScanStateConflictError("explanation verdict must match the persisted oracle verdict");
    }
    for (const evidenceId of input.evidenceIds) {
      const row = this.evidence.find((e) => e.id === evidenceId);
      if (
        !row ||
        row.workspaceId !== input.workspaceId ||
        row.scanId !== input.scanId ||
        row.attemptId !== input.attemptId
      ) {
        throw new ScanStateConflictError(`evidence ${evidenceId} not found`);
      }
    }
    const id = randomUUID();
    this.explanations.set(id, {
      id,
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      attemptId: input.attemptId,
      oracleVerdict: input.oracleVerdict,
    });
    return { id, attemptId: input.attemptId, oracleVerdict: input.oracleVerdict };
  }

  async recordContainmentEvent(event: ContainmentEvent) {
    this.containment.push(event);
  }

  async listActiveRunnerIds(_ws: string, scanId: string) {
    return this.runners.filter((r) => r.scanId === scanId && !r.terminal).map((r) => r.id as never);
  }
}

export class InMemoryEventPublisher implements ScanEventPublisher {
  events: ScanEvent[] = [];
  private seq = new Map<string, number>();

  async publish(input: PublishScanEventInput): Promise<ScanEvent> {
    const next = (this.seq.get(input.scanId) ?? 0) + 1;
    this.seq.set(input.scanId, next);
    const event = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      seq: next,
      schemaVersion: 1,
      eventType: input.eventType,
      phase: input.phase,
      actorType: input.actorType,
      safeSummary: input.safeSummary,
      payloadRedacted: input.payloadRedacted,
      attemptId: input.attemptId,
      occurredAt: new Date().toISOString(),
    } as unknown as ScanEvent;
    this.events.push(event);
    return event;
  }

  forScan(scanId: string): ScanEvent[] {
    return this.events.filter((e) => e.scanId === scanId);
  }

  types(scanId: string): string[] {
    return this.forScan(scanId).map((e) => e.eventType);
  }
}
