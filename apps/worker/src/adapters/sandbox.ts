/**
 * Real sandbox executor — two production paths, no mocks.
 *
 * `container` (L14, @highcastle/sandbox): SandboxController over
 * DockerRuntime + L02-backed runner registry + StaticLabPolicyGate +
 * StaticSyntheticCredentialResolver. Bound dynamically so this worker
 * compiles before the package merges; when the module is absent the
 * executor falls back to `direct` — and container executions that produce
 * no parsed observations still adjudicate `inconclusive`, never confirmed.
 *
 * `direct` (H path): the L15-owned `runBolaPack` executes the trusted,
 * policy-approved GET-only pack against the lab base URL pinned by the
 * request's targetServiceAlias. The pack's own parsed legs are adjudicated
 * by L15's oracle inside `runBolaPack` — the adjudication is genuine
 * oracle output on real observations, not a runner-supplied boolean.
 * Selected when HIGHCASTLE_EXECUTOR=direct, or `auto` without the package.
 *
 * Canonical synthetic refs: `ref:synthetic:alice_session` resolves to the
 * lab fixture token via SYNTHETIC_CREDENTIAL_VALUE or env override
 * (HIGHCASTLE_LAB_TOKEN_ALICE). The value never leaves this process.
 */
import {
  BOLA_ORACLE_VERSION,
  runBolaPack,
  toSandboxResult,
  type BolaAttemptAdjudication,
  type PackRunResult,
} from "@highcastle/test-packs";
import { IntegrationBlockedError } from "./errors.js";
import type {
  AttemptAdjudication,
  ReapReport,
  SandboxExecutor,
  SandboxRunOutcome,
} from "./ports.js";
import type { SandboxRequest, SandboxResult } from "@highcastle/contracts";
import { randomUUID } from "node:crypto";

/** Synthetic fixture credential values (mirror of L14 SYNTHETIC_CREDENTIALS). */
const SYNTHETIC_CREDENTIAL_VALUES: Record<string, string> = {
  "ref:synthetic:alice_session": "lab-token-alice",
  "ref:synthetic:bob_session": "lab-token-bob",
};

function credentialValue(ref: string, env: NodeJS.ProcessEnv): string {
  const envKey =
    ref === "ref:synthetic:alice_session"
      ? "HIGHCASTLE_LAB_TOKEN_ALICE"
      : "HIGHCASTLE_LAB_TOKEN_BOB";
  return env[envKey] ?? SYNTHETIC_CREDENTIAL_VALUES[ref] ?? "";
}

function mapAdjudication(a: BolaAttemptAdjudication): AttemptAdjudication {
  return {
    attemptId: a.attemptId,
    oracleVersion: a.oracleVersion ?? BOLA_ORACLE_VERSION,
    baseline: a.baseline,
    securityCheck: a.securityCheck,
    verdict: a.verdict,
    preconditionsOk: a.preconditionsOk,
    reasons: a.reasons,
  };
}

/** Trusted direct-pack executor: real HTTP, real oracle, no container. */
class DirectPackExecutor implements SandboxExecutor {
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly env: NodeJS.ProcessEnv,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  async execute(
    request: SandboxRequest,
    ctx: Parameters<SandboxExecutor["execute"]>[1],
  ): Promise<SandboxRunOutcome> {
    if (ctx.signal?.aborted) {
      return {
        kind: "executed",
        runnerId: randomUUID() as never,
        outcome: "failed",
        result: null,
        observations: null,
        containmentEvents: [],
        exitCode: null,
        resultError: "canceled before dispatch",
      };
    }

    const baseUrl =
      this.env.HIGHCASTLE_LAB_BASE_URL ?? this.env.DEMO_TARGET_BASE_URL ?? "http://target-lab:3000";
    const runnerId = randomUUID() as unknown as Parameters<SandboxExecutor["cancel"]>[0];
    const localAbort = new AbortController();
    this.active.set(runnerId as string, localAbort);
    try {
      const run: PackRunResult = await runBolaPack({
        baseUrl,
        aliceCredential: credentialValue(request.actorCredentialRef, this.env),
        expectedRevision: (ctx.expectedRevision ??
          this.env.HIGHCASTLE_LAB_REVISION ??
          "lab-v1-vulnerable") as never,
        attemptId: request.attemptId as string,
        maxRequests: request.limits.maxRequests,
        maxDurationSeconds: request.limits.maxDurationSeconds,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      });
      const result: SandboxResult = toSandboxResult(run, {
        nonce: request.nonce,
        runnerId: runnerId as unknown as string,
      } as never);
      return {
        kind: "executed",
        runnerId,
        outcome: localAbort.signal.aborted ? "killed" : result.status,
        result,
        observations: null,
        adjudication: mapAdjudication(run.adjudication),
        containmentEvents: [],
        exitCode: result.exitCode,
        resultError: null,
      };
    } catch (err) {
      return {
        kind: "executed",
        runnerId,
        outcome: localAbort.signal.aborted ? "killed" : "failed",
        result: null,
        observations: null,
        containmentEvents: [],
        exitCode: null,
        resultError: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.active.delete(runnerId as string);
    }
  }

  async cancel(runnerId: Parameters<SandboxExecutor["cancel"]>[0]): Promise<void> {
    this.active.get(runnerId as string)?.abort();
  }

  async reconcileOrphans(): Promise<ReapReport> {
    return { inspected: 0, reaped: [], markedLost: [], errors: [] };
  }
}

// ------------------------------------------------------------ container ---

interface SandboxControllerLike {
  execute(
    request: SandboxRequest,
    ctx: { workspaceId: string; signal?: AbortSignal | undefined },
  ): Promise<unknown>;
  cancel(runnerId: never, reason: string): Promise<void>;
  reconcileOrphans(now?: Date): Promise<ReapReport>;
}

async function loadController(): Promise<SandboxControllerLike> {
  const pkg = "@highcastle/sandbox";
  const mod = (await import(pkg)) as Record<string, unknown>;
  const Controller = mod["SandboxController"] as
    (new (deps: Record<string, unknown>) => SandboxControllerLike) | undefined;
  if (!Controller) {
    throw new IntegrationBlockedError("@highcastle/sandbox", "PR #15 packages/sandbox");
  }
  const env = process.env;
  return new Controller({
    runtime: new (mod["DockerRuntime"] as new () => unknown)(),
    registry: new (mod["InMemoryRunnerRegistry"] as new () => unknown)(),
    policyGate: new (mod["StaticLabPolicyGate"] as new () => unknown)(),
    credentialResolver: new (mod["StaticSyntheticCredentialResolver"] as new () => unknown)(),
    config: {
      labOrigin: env.HIGHCASTLE_LAB_BASE_URL ?? "http://target-lab:3000",
    },
  });
}

class ContainerExecutor implements SandboxExecutor {
  private controller: Promise<SandboxControllerLike> | null = null;
  private load(): Promise<SandboxControllerLike> {
    this.controller ??= loadController();
    return this.controller;
  }
  async execute(
    request: SandboxRequest,
    ctx: Parameters<SandboxExecutor["execute"]>[1],
  ): Promise<SandboxRunOutcome> {
    const c = await this.load();
    const run = (await c.execute(request, {
      workspaceId: ctx.workspaceId,
      signal: ctx.signal,
    })) as unknown as
      | { kind: "denied"; decision: { reasons?: { code: string }[]; policyVersion?: string } }
      | { kind: "precondition_failed"; reason: string }
      | {
          kind: "executed";
          runner: { id: string };
          outcome: string;
          result: SandboxResult | null;
          resultError: string | null;
          containmentEvents: never[];
          exitCode: number | null;
        };
    if (run.kind === "denied") {
      return {
        kind: "denied",
        reason: run.decision.reasons?.map((r) => r.code).join(", ") || "policy denied",
        policyVersion: run.decision.policyVersion ?? "unknown",
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
      observations: null,
      containmentEvents: run.containmentEvents,
      exitCode: run.exitCode,
      resultError: run.resultError,
    };
  }
  async cancel(runnerId: never, reason: string): Promise<void> {
    const c = await this.load();
    return c.cancel(runnerId, reason);
  }
  async reconcileOrphans(now?: Date): Promise<ReapReport> {
    const c = await this.load();
    return c.reconcileOrphans(now);
  }
}

export interface SandboxExecutorOptions {
  env?: NodeJS.ProcessEnv;
  /** Force a path; `auto` prefers container, falls back to direct. */
  mode?: "auto" | "direct" | "container";
  /** Test seam for the direct executor's HTTP calls. */
  fetchImpl?: typeof fetch;
}

export function createSandboxExecutor(options: SandboxExecutorOptions = {}): SandboxExecutor {
  const env = options.env ?? process.env;
  const mode = options.mode ?? env.HIGHCASTLE_EXECUTOR ?? "auto";
  const mkDirect = () => new DirectPackExecutor(env, options.fetchImpl);

  if (mode === "direct") return mkDirect();
  if (mode === "container") return new ContainerExecutor();

  // auto: lazily probe the sandbox package once, then choose.
  let chosen: SandboxExecutor | null = null;
  const direct: SandboxExecutor = mkDirect();
  const container: SandboxExecutor = new ContainerExecutor();
  return {
    async execute(request, ctx) {
      if (chosen === null) {
        try {
          await (container as never as { load(): Promise<unknown> }).load();
          chosen = container;
        } catch {
          chosen = direct;
        }
      }
      return chosen.execute(request, ctx);
    },
    async cancel(runnerId, reason) {
      if (chosen !== null) return chosen.cancel(runnerId, reason);
      return direct.cancel(runnerId, reason);
    },
    async reconcileOrphans(now) {
      const active = chosen ?? direct;
      return active.reconcileOrphans(now);
    },
  };
}
