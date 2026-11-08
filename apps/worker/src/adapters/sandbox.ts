/**
 * Production sandbox executor — REAL container execution via L14's
 * @highcastle/sandbox. No fallbacks, no mocks: production scans ALWAYS go
 * through `SandboxController` + `DockerCliRuntime` on the host daemon.
 *
 * - `DockerCliRuntime` (not DockerRuntime) is the merged container runtime.
 * - `StaticSyntheticCredentialResolver` resolves `ref:synthetic:<role>_session`
 *   to lab fixture token values — the VALUE never leaves the controller.
 * - `DbRunnerRegistry` persists runner_instances rows via L02 so runner
 *   lifecycle and cleanup are durable and queryable.
 * - `run.observations` (runner-emitted ParsedObservation legs) are
 *   extracted into `AttemptObservations` for the L15 oracle. A missing,
 *   inconsistent or duplicate leg → `observations: null` → inconclusive.
 *   Runner booleans are never verdict input.
 */
import {
  DockerCliRuntime,
  SandboxController,
  StaticLabPolicyGate,
  StaticSyntheticCredentialResolver,
  type RunnerRegistry,
  type SandboxExecution,
} from "@highcastle/sandbox";
import type { ParsedObservation } from "@highcastle/sandbox";
import { runnerInstances } from "@highcastle/db";
import { eq } from "drizzle-orm";
import type { DbExecutor } from "@highcastle/db";
import type { RunnerInstance } from "@highcastle/contracts";
import type { SandboxRequest } from "@highcastle/contracts";
import type {
  AttemptObservations,
  ObservedLeg,
  ReapReport,
  SandboxExecutor,
  SandboxRunOutcome,
} from "./ports.js";

// ------------------------------------------------------------ legs ---

/** Required runner observation steps — every leg must appear exactly once. */
const REQUIRED_STEPS = [
  "health",
  "ready",
  "meta",
  "whoami",
  "own_invoice",
  "cross_invoice",
] as const;
type StepName = (typeof REQUIRED_STEPS)[number];

/**
 * Map runner `ParsedObservation[]` to the oracle's AttemptObservations.
 * Strict validation: all six steps present exactly once; a missing,
 * duplicated or malformed leg returns null → inconclusive, never
 * a confirmed finding from partial evidence.
 */
export function observationsFromRun(
  attemptId: string,
  expectedRevision: string,
  raw: ParsedObservation[] | null | undefined,
): AttemptObservations | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const byStep = new Map<StepName, ParsedObservation>();
  for (const obs of raw) {
    if (!obs || typeof obs.step !== "string") return null;
    const step = obs.step as StepName;
    if (!REQUIRED_STEPS.includes(step)) return null;
    if (byStep.has(step)) return null; // duplicate leg — untrusted
    byStep.set(step, obs);
  }
  if (byStep.size !== REQUIRED_STEPS.length) return null; // missing leg
  const leg = (s: StepName): ObservedLeg | null => {
    const o = byStep.get(s);
    if (!o || typeof o.status !== "number") return null;
    return {
      status: o.status,
      bodyText: typeof o.body === "string" ? o.body : JSON.stringify(o.body ?? ""),
      body: o.body,
      revisionEcho: o.revisionEcho ?? null,
    };
  };
  const health = leg("health");
  const ready = leg("ready");
  const meta = leg("meta");
  const ownInvoice = leg("own_invoice");
  const crossInvoice = leg("cross_invoice");
  if (!health || !ready || !meta || !ownInvoice || !crossInvoice) return null;

  // --- Identity gate (defense in depth, mirrored in-container): the
  // whoami leg must be a 200 whose body resolves a non-empty actor, and
  // that actor must BE the owner of the own-invoice leg's invoice. An
  // invalid, empty or owner-inconsistent identity means the evidence is
  // untrusted -> inconclusive, never confirmed.
  const whoami = byStep.get("whoami");
  if (!whoami || whoami.status !== 200) return null;
  const actor = (whoami.body as { actor?: { userId?: unknown; tenantId?: unknown } })?.actor;
  const actorId =
    typeof actor?.userId === "string" && actor.userId.length > 0 ? actor.userId : null;
  const actorTenant =
    typeof actor?.tenantId === "string" && actor.tenantId.length > 0 ? actor.tenantId : null;
  if (!actorId || !actorTenant) return null;
  const ownInv = (ownInvoice.body as { invoice?: { ownerId?: unknown; tenantId?: unknown } })
    ?.invoice;
  if (!ownInv || ownInv.ownerId !== actorId || ownInv.tenantId !== actorTenant) return null;

  return { attemptId, expectedRevision, health, ready, meta, ownInvoice, crossInvoice };
}

// ----------------------------------------------------------- execute ---

function mapExecution(run: SandboxExecution): SandboxRunOutcome {
  if (run.kind === "denied") {
    return {
      kind: "denied",
      reason: run.decision.reason ?? "policy denied",
      policyVersion: run.decision.policyVersion,
    };
  }
  if (run.kind === "precondition_failed") {
    return { kind: "precondition_failed", reason: run.reason };
  }
  return {
    kind: "executed",
    runnerId: run.runner.id as never,
    outcome: run.outcome as never,
    result: run.result,
    observations: null, // populated by caller via observationsFromRun
    containmentEvents: run.containmentEvents as never,
    exitCode: run.exitCode,
    resultError: run.resultError,
  };
}

export class ContainerExecutor implements SandboxExecutor {
  private readonly controller: SandboxController;

  constructor(
    controller?: SandboxController,
    config?: { labOrigin?: string; imageDigest?: string; registry?: RunnerRegistry },
  ) {
    this.controller =
      controller ??
      new SandboxController({
        runtime: new DockerCliRuntime(),
        registry:
          config?.registry ??
          (() => {
            throw new Error(
              "ContainerExecutor requires a durable RunnerRegistry — " +
                "runner lifecycle must persist to runner_instances, " +
                "in-memory lifecycle state is not acceptable in production",
            );
          })(),
        policyGate: new StaticLabPolicyGate(),
        credentialResolver: new StaticSyntheticCredentialResolver(),
        ...(config?.labOrigin || config?.imageDigest
          ? {
              config: {
                ...(config.labOrigin ? { labOrigin: config.labOrigin } : {}),
                ...(config.imageDigest ? { imageDigest: config.imageDigest } : {}),
              },
            }
          : {}),
      });
  }

  async execute(
    request: SandboxRequest,
    ctx: Parameters<SandboxExecutor["execute"]>[1],
  ): Promise<SandboxRunOutcome> {
    const run = await this.controller.execute(request, {
      workspaceId: ctx.workspaceId as never,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    const outcome = mapExecution(run);
    // Wire the real runner observations into the oracle-facing shape.
    if (outcome.kind === "executed") {
      outcome.observations = observationsFromRun(
        request.attemptId as string,
        ctx.expectedRevision ?? "",
        (run as { kind: "executed"; observations: ParsedObservation[] }).observations,
      );
    }
    return outcome;
  }

  async cancel(runnerId: Parameters<SandboxExecutor["cancel"]>[0], reason: string): Promise<void> {
    return this.controller.cancel(runnerId, reason);
  }

  async reconcileOrphans(now?: Date): Promise<ReapReport> {
    return this.controller.reconcileOrphans(now) as Promise<ReapReport>;
  }
}

export interface SandboxExecutorOptions {
  env?: NodeJS.ProcessEnv;
  /** test seam — inject a prepared controller. */
  controller?: SandboxController;
  /** durable runner lifecycle registry (L02 runner_instances). */
  registry?: RunnerRegistry;
}

export function createSandboxExecutor(options: SandboxExecutorOptions = {}): SandboxExecutor {
  const env = options.env ?? process.env;
  const config: { labOrigin?: string; imageDigest?: string } = {};
  if (env.HIGHCASTLE_LAB_BASE_URL) config.labOrigin = env.HIGHCASTLE_LAB_BASE_URL;
  if (env.HIGHCASTLE_TARGET_IMAGE_DIGEST) config.imageDigest = env.HIGHCASTLE_TARGET_IMAGE_DIGEST;
  return new ContainerExecutor(options.controller, {
    ...config,
    ...(options.registry ? { registry: options.registry } : {}),
  });
}

// ------------------------------------------------- durable registry ---

/**
 * L14 `RunnerRegistry` over L02's `runner_instances` table — durable
 * lifecycle rows so runner creation/termination/cleanup-verification is
 * queryable (containment evidence, cross-process cancellation, janitor
 * reconciliation audit) instead of living only in process memory.
 */
export class DbRunnerRegistry implements RunnerRegistry {
  constructor(private readonly db: DbExecutor) {}

  private toRow(instance: RunnerInstance) {
    const dt = (v: string | null | undefined) => (v ? new Date(v) : null);
    return {
      id: instance.id as string,
      workspaceId: instance.workspaceId as string,
      scanId: instance.scanId as string,
      sandboxId: instance.sandboxId,
      imageDigest: instance.imageDigest,
      networkProfile: instance.networkProfile,
      resourceLimits: instance.limits as Record<string, unknown>,
      status: instance.status as never,
      startedAt: dt(instance.startedAt),
      terminatedAt: dt(instance.terminatedAt),
      cleanupVerifiedAt: dt(instance.cleanupVerifiedAt),
      timeoutAt: dt(instance.timeoutAt),
      exitCode: instance.exitCode,
      reason: instance.reason,
    };
  }

  private toInstance(row: typeof runnerInstances.$inferSelect): RunnerInstance {
    const iso = (v: Date | null) => (v ? v.toISOString() : null);
    return {
      id: row.id as never,
      workspaceId: row.workspaceId as never,
      scanId: row.scanId as never,
      sandboxId: row.sandboxId,
      imageDigest: row.imageDigest,
      networkProfile: row.networkProfile,
      limits: row.resourceLimits as never,
      status: row.status as never,
      createdAt: row.createdAt.toISOString(),
      startedAt: iso(row.startedAt),
      terminatedAt: iso(row.terminatedAt),
      cleanupVerifiedAt: iso(row.cleanupVerifiedAt),
      timeoutAt: iso(row.timeoutAt),
      exitCode: row.exitCode,
      reason: row.reason,
    };
  }

  async create(instance: RunnerInstance): Promise<void> {
    await this.db.insert(runnerInstances).values(this.toRow(instance));
  }

  async update(id: RunnerInstance["id"], patch: Partial<RunnerInstance>): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    const merged = { ...existing, ...patch } as RunnerInstance;
    const row = this.toRow(merged);
    await this.db
      .update(runnerInstances)
      .set({
        status: row.status,
        startedAt: row.startedAt,
        terminatedAt: row.terminatedAt,
        cleanupVerifiedAt: row.cleanupVerifiedAt,
        timeoutAt: row.timeoutAt,
        exitCode: row.exitCode,
        reason: row.reason,
      })
      .where(eq(runnerInstances.id, id as string));
  }

  async get(id: RunnerInstance["id"]): Promise<RunnerInstance | null> {
    const rows = await this.db
      .select()
      .from(runnerInstances)
      .where(eq(runnerInstances.id, id as string));
    return rows[0] ? this.toInstance(rows[0]) : null;
  }

  async listActive(): Promise<RunnerInstance[]> {
    const all = await this.listAll();
    const terminal = new Set(["destroyed", "cleanup_verified", "forced_stop", "error"]);
    return all.filter((i) => !terminal.has(i.status));
  }

  async listAll(): Promise<RunnerInstance[]> {
    const rows = await this.db.select().from(runnerInstances);
    return rows.map((r) => this.toInstance(r));
  }
}
