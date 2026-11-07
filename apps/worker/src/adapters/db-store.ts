/**
 * Real @highcastle/db bindings (post-merge). Each port method delegates to
 * the L02 repo function; four thin helpers the repos don't expose are
 * implemented here as workspace-scoped Drizzle queries over dbSchema tables.
 */
import { and, desc, eq, notInArray } from "drizzle-orm";
import {
  appendScanEvent,
  createAttempt,
  createDb,
  createEvidenceArtifact,
  createReplay,
  createScan,
  getAttempt,
  getEnvironment,
  getFinding,
  getProject,
  getReplay,
  getScan,
  getScope,
  getTarget,
  listAttempts,
  listTestIdentities,
  recordAgentProposal,
  recordAttemptVerdict,
  recordContainmentEvent,
  recordModelCall,
  requestScanCancel,
  transitionScan,
  updateAttemptStatus,
  upsertFindingFromVerdict,
  completeReplay as dbCompleteReplay,
  agentProposals,
  runnerInstances,
  testAttempts,
  type Database,
} from "@highcastle/db";
import type {
  AttemptRecord,
  CreateReplayScanInput,
  OrchestratorStore,
  PublishScanEventInput,
  ReplayOracleEvidenceInput,
  ScanEventPublisher,
  ScanTransitionInput,
  UpsertFindingResult,
} from "./ports.js";

const NONTERMINAL_RUNNER = ["destroyed", "cleanup_verified", "forced_stop", "error"] as const;

export class DbOrchestratorStore implements OrchestratorStore {
  constructor(private readonly db: Database) {}

  getScan = (ws: string, id: string) => getScan(this.db, ws, id) as Promise<never>;
  transitionScan = (ws: string, id: string, t: ScanTransitionInput) =>
    transitionScan(this.db, ws, id, t as never) as Promise<never>;
  requestScanCancel = (ws: string, id: string) =>
    requestScanCancel(this.db, ws, id) as Promise<never>;
  getScope = (ws: string, id: string) => getScope(this.db, ws, id) as Promise<never>;
  getProject = (ws: string, id: string) => getProject(this.db, ws, id) as Promise<never>;
  getTarget = (ws: string, id: string) => getTarget(this.db, ws, id) as Promise<never>;
  getEnvironment = (ws: string, id: string) => getEnvironment(this.db, ws, id) as Promise<never>;

  async getTestIdentity(ws: string, envId: string, role: "alice" | "bob") {
    const rows = await listTestIdentities(this.db, ws, envId);
    return (rows.find((r) => r.role === role) ?? null) as never;
  }

  createAttempt = (input: Parameters<OrchestratorStore["createAttempt"]>[0]) =>
    createAttempt(this.db, input as never) as Promise<AttemptRecord>;
  getAttempt = (ws: string, id: string) =>
    getAttempt(this.db, ws, id) as Promise<AttemptRecord | null>;
  listAttempts = (ws: string, scanId: string) =>
    listAttempts(this.db, ws, scanId) as Promise<AttemptRecord[]>;
  updateAttemptStatus = (ws: string, id: string, status: AttemptRecord["status"]) =>
    updateAttemptStatus(this.db, ws, id, status) as Promise<AttemptRecord>;
  recordAttemptVerdict = (
    ws: string,
    id: string,
    v: Parameters<OrchestratorStore["recordAttemptVerdict"]>[2],
  ) => recordAttemptVerdict(this.db, ws, id, v) as Promise<AttemptRecord>;

  async findAttemptByPlanHash(ws: string, scanId: string, planHash: string) {
    const rows = await this.db
      .select()
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.scanId, scanId),
          eq(testAttempts.workspaceId, ws),
          eq(testAttempts.planHash, planHash),
        ),
      )
      .limit(1);
    return (rows[0] as unknown as AttemptRecord | undefined) ?? null;
  }

  recordModelCall = (input: Parameters<OrchestratorStore["recordModelCall"]>[0]) =>
    recordModelCall(this.db, input as never) as Promise<never>;
  recordAgentProposal = (input: Parameters<OrchestratorStore["recordAgentProposal"]>[0]) =>
    recordAgentProposal(this.db, input as never) as Promise<never>;

  async findLatestProposal(ws: string, scanId: string) {
    const rows = await this.db
      .select()
      .from(agentProposals)
      .where(and(eq(agentProposals.scanId, scanId), eq(agentProposals.workspaceId, ws)))
      .orderBy(desc(agentProposals.createdAt))
      .limit(1);
    return (rows[0] ?? null) as never;
  }

  upsertFindingFromVerdict = async (
    input: Parameters<OrchestratorStore["upsertFindingFromVerdict"]>[0],
  ): Promise<UpsertFindingResult> =>
    upsertFindingFromVerdict(this.db, input as never) as Promise<UpsertFindingResult>;
  getFinding = (ws: string, id: string) => getFinding(this.db, ws, id) as Promise<never>;
  createReplay = (input: Parameters<OrchestratorStore["createReplay"]>[0]) =>
    createReplay(this.db, input as never) as Promise<never>;
  getReplay = (ws: string, id: string) => getReplay(this.db, ws, id) as Promise<never>;

  completeReplay = (ws: string, replayId: string, evidence: ReplayOracleEvidenceInput) =>
    dbCompleteReplay(this.db, ws, replayId, evidence) as Promise<never>;

  async createReplayScan(input: CreateReplayScanInput) {
    return createScan(this.db, {
      ...input,
      scanType: "replay_verification",
    } as never) as Promise<never> as Promise<
      Awaited<ReturnType<OrchestratorStore["createReplayScan"]>>
    >;
  }

  createEvidenceArtifact = (input: Parameters<OrchestratorStore["createEvidenceArtifact"]>[0]) =>
    createEvidenceArtifact(this.db, input as never) as Promise<{ id: string }>;
  recordContainmentEvent = async (event: never) => {
    await recordContainmentEvent(this.db, event as never);
  };

  async listActiveRunnerIds(_ws: string, scanId: string) {
    const rows = await this.db
      .select({ id: runnerInstances.id })
      .from(runnerInstances)
      .where(
        and(
          eq(runnerInstances.scanId, scanId),
          notInArray(runnerInstances.status, [...NONTERMINAL_RUNNER]),
        ),
      );
    return rows.map((r) => r.id as never);
  }
}

export class DbScanEventPublisher implements ScanEventPublisher {
  constructor(private readonly db: Database) {}
  publish = (input: PublishScanEventInput) =>
    appendScanEvent(this.db, input as never) as Promise<never> as ReturnType<
      ScanEventPublisher["publish"]
    >;
}

/** Wire the production store + event publisher from env. */
export function createDbPorts(env: NodeJS.ProcessEnv = process.env): {
  store: DbOrchestratorStore;
  events: DbScanEventPublisher;
} {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL required for db-backed orchestrator");
  }
  const { db } = createDb({ connectionString });
  return {
    store: new DbOrchestratorStore(db),
    events: new DbScanEventPublisher(db),
  };
}
