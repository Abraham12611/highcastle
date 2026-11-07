/**
 * SandboxController — the trusted lifecycle owner for ephemeral runners.
 *
 * Responsibilities (per docs/security/02 and docs/agents/01):
 * - re-validate the SandboxRequest (Zod, strict) — never trust upstream
 * - re-check policy on dispatch via the injected gate (fail closed)
 * - verify the lab network exists and is internal BEFORE creating anything
 * - create → start (stdin envelope) → watchdog wait → parse → destroy →
 *   verify cleanup; the container is ALWAYS removed
 * - mint ContainmentEvents ONLY from probe lines reporting an observed
 *   runtime denial — never from a policy decision or a fabricated claim
 * - cancel/kill on demand and reap orphaned managed containers (janitor)
 *
 * The model cannot reach this component; L13/L16 hand it an already-frozen
 * SandboxRequest. There is no code path here that accepts commands, hosts,
 * flags or URLs from outside the contract.
 */

import { randomUUID } from "node:crypto";

import {
  ContainmentEventSchema,
  SandboxRequestSchema,
  type ContainmentEvent,
  type RunnerInstance,
  type RunnerInstanceId,
  type SandboxRequest,
  type SandboxResult,
  type WorkspaceId,
} from "@highcastle/contracts";

import {
  DEFAULT_LAB_NETWORK,
  DEFAULT_LAB_ORIGIN,
  DEFAULT_RUNNER_IMAGE,
  LABEL_EXPIRES_AT,
  LABEL_MANAGED_BY,
  LABEL_MANAGED_BY_VALUE,
  LABEL_RUNNER_ID,
  NETWORK_PROFILE_ID,
  TIMEOUT_GRACE_MS,
} from "./constants.ts";
import { buildDockerCreateArgs, runnerContainerName } from "./dockerArgs.ts";
import { buildRunnerEnvelope, serializeEnvelope } from "./envelope.ts";
import { parseRunnerOutput, type ParsedProbe } from "./output.ts";
import type {
  Clock,
  ContainerRuntime,
  CredentialResolver,
  PolicyDecision,
  RunnerRegistry,
  SandboxPolicyGate,
  StartedContainer,
} from "./ports.ts";
import { systemClock } from "./ports.ts";

export interface SandboxControllerConfig {
  /** Runner image ref (tag or digest) built from infra/docker/runner. */
  runnerImage: string;
  /** Internal-only Docker network shared with the lab. */
  labNetwork: string;
  /** Lab origin passed to the runner; re-allowlisted inside the program. */
  labOrigin: string;
  /** Refuse to launch unless the lab network is Docker-internal. */
  requireInternalNetwork: boolean;
  networkProfile: string;
  /** Grace added to the contract deadline before SIGKILL (ms). */
  timeoutGraceMs: number;
}

export const DEFAULT_CONTROLLER_CONFIG: SandboxControllerConfig = {
  runnerImage: DEFAULT_RUNNER_IMAGE,
  labNetwork: DEFAULT_LAB_NETWORK,
  labOrigin: DEFAULT_LAB_ORIGIN,
  requireInternalNetwork: true,
  networkProfile: NETWORK_PROFILE_ID,
  timeoutGraceMs: TIMEOUT_GRACE_MS,
};

export interface ExecuteContext {
  workspaceId: WorkspaceId;
  /** Cooperative cancellation (scan cancel / emergency stop). */
  signal?: AbortSignal;
}

export type ExecutionOutcome = "completed" | "timeout" | "failed" | "killed" | "containment_breach";

export interface DeniedExecution {
  kind: "denied";
  request: SandboxRequest;
  decision: PolicyDecision;
}

export interface PreconditionFailedExecution {
  kind: "precondition_failed";
  request: SandboxRequest;
  reason: string;
}

export interface ExecutedRun {
  kind: "executed";
  request: SandboxRequest;
  runner: RunnerInstance;
  outcome: ExecutionOutcome;
  /** Validated SandboxResult; null when the runner never produced one. */
  result: SandboxResult | null;
  resultError: string | null;
  /** Runtime-denial events minted from observed probe output. */
  containmentEvents: ContainmentEvent[];
  /** All well-formed probe telemetry (denied/observed/breach/error). */
  probes: ParsedProbe[];
  exitCode: number | null;
}

export type SandboxExecution = DeniedExecution | PreconditionFailedExecution | ExecutedRun;

export interface ReapReport {
  inspected: number;
  reaped: { containerId: string; runnerId: string | null }[];
  /** Registry rows that lost their container unexpectedly. */
  markedLost: RunnerInstanceId[];
  errors: string[];
}

/** Normalize a pinned digest (`sha256:x`, `repo@sha256:x`, or bare hex) to its hex. */
export function normalizeDigest(digest: string): string {
  const m = /([0-9a-f]{64})/.exec(digest);
  return m?.[1] ?? digest.trim();
}

function delay(ms: number): { promise: Promise<"deadline">; cancel: () => void } {
  let resolveRef: () => void = () => undefined;
  const promise = new Promise<"deadline">((resolve) => {
    resolveRef = () => resolve("deadline");
  });
  const handle = setTimeout(() => resolveRef(), ms);
  return { promise, cancel: () => clearTimeout(handle) };
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SandboxController {
  private readonly inFlight = new Map<RunnerInstanceId, AbortController>();

  private async mustGet(runnerId: RunnerInstanceId): Promise<RunnerInstance> {
    const row = await this.deps.registry.get(runnerId);
    if (row === null) throw new Error(`runner ${runnerId} missing from registry`);
    return row;
  }

  private readonly deps: {
    runtime: ContainerRuntime;
    registry: RunnerRegistry;
    policyGate: SandboxPolicyGate;
    credentialResolver: CredentialResolver;
    clock?: Clock;
    config?: Partial<SandboxControllerConfig>;
  };
  private readonly config: SandboxControllerConfig;

  constructor(deps: {
    runtime: ContainerRuntime;
    registry: RunnerRegistry;
    policyGate: SandboxPolicyGate;
    credentialResolver: CredentialResolver;
    clock?: Clock;
    config?: Partial<SandboxControllerConfig>;
  }) {
    this.deps = deps;
    this.config = { ...DEFAULT_CONTROLLER_CONFIG, ...deps.config };
  }
  private get clock(): Clock {
    return this.deps.clock ?? systemClock;
  }

  /**
   * Full attempt lifecycle. Always resolves to a SandboxExecution; throw only
   * for contract-violating input (invalid request shape) — the orchestrator
   * maps outcomes to scan state.
   */
  async execute(request: SandboxRequest, ctx: ExecuteContext): Promise<SandboxExecution> {
    // 1. Strict re-validation at the trust boundary.
    const req = SandboxRequestSchema.parse(request);

    // 2. Policy re-check on dispatch (fail closed on gate errors).
    const decision = await this.authorize(req);
    if (!decision.allowed) {
      return { kind: "denied", request: req, decision };
    }

    // 3. Environment preconditions: runtime present, lab network internal,
    //    and the running lab image matches the pinned digest.
    const precheck = await this.preconditions(req);
    if (precheck !== null) {
      return { kind: "precondition_failed", request: req, reason: precheck };
    }

    // 4. Resolve the synthetic credential ref (fails closed on unknown refs).
    let token: string;
    try {
      token = await this.deps.credentialResolver.resolve(req.actorCredentialRef);
    } catch (err) {
      return {
        kind: "precondition_failed",
        request: req,
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    const runnerId = randomUUID() as RunnerInstanceId;
    const now = this.clock.now();
    const deadlineMs = req.limits.maxDurationSeconds * 1000 + this.config.timeoutGraceMs;

    const instance: RunnerInstance = {
      id: runnerId,
      workspaceId: ctx.workspaceId,
      scanId: req.scanId,
      sandboxId: runnerContainerName(runnerId),
      imageDigest: this.config.runnerImage,
      networkProfile: this.config.networkProfile,
      limits: req.limits,
      status: "allocated",
      createdAt: now.toISOString(),
      startedAt: null,
      terminatedAt: null,
      cleanupVerifiedAt: null,
      timeoutAt: new Date(now.getTime() + deadlineMs).toISOString(),
      exitCode: null,
      reason: null,
    };
    await this.deps.registry.create(instance);

    const abort = new AbortController();
    this.inFlight.set(runnerId, abort);
    if (ctx.signal) {
      if (ctx.signal.aborted) abort.abort();
      else ctx.signal.addEventListener("abort", () => abort.abort(), { once: true });
    }

    try {
      return await this.runToCompletion(req, ctx, instance, token, deadlineMs, abort.signal);
    } finally {
      this.inFlight.delete(runnerId);
    }
  }

  /** Cooperative cancel: aborts an in-flight execute() for this runner. */
  async cancel(runnerId: RunnerInstanceId, reason = "cancel_requested"): Promise<void> {
    const controller = this.inFlight.get(runnerId);
    if (controller) {
      controller.abort(reason);
      return;
    }
    // Not in-flight here but possibly still a live container — force cleanup.
    await this.forceKill(runnerId, reason);
  }

  /** Hard kill + remove + verify for a known runner (no in-flight execution). */
  async forceKill(
    runnerId: RunnerInstanceId,
    reason = "force_kill",
  ): Promise<RunnerInstance | null> {
    const row = await this.deps.registry.get(runnerId);
    if (!row) return null;
    const stopAt = this.clock.now().toISOString();
    await this.deps.registry.update(runnerId, {
      status: "forced_stop",
      terminatedAt: stopAt,
      reason,
    });
    const inspection = await this.deps.runtime.inspectContainer(row.sandboxId);
    if (inspection.exists) {
      await this.deps.runtime.killContainer(row.sandboxId).catch(() => undefined);
      await this.deps.runtime.removeContainer(row.sandboxId).catch(() => undefined);
    }
    const verified = await this.verifyGone(row.sandboxId);
    const finalStatus = verified ? "cleanup_verified" : "error";
    const patch: Partial<RunnerInstance> = {
      status: finalStatus,
      terminatedAt: this.clock.now().toISOString(),
      ...(verified ? { cleanupVerifiedAt: this.clock.now().toISOString() } : {}),
      reason: verified ? reason : `${reason}; container removal could not be verified`,
    };
    await this.deps.registry.update(runnerId, patch);
    return this.deps.registry.get(runnerId);
  }

  private async authorize(req: SandboxRequest): Promise<PolicyDecision> {
    try {
      return await this.deps.policyGate.authorize(req);
    } catch (err) {
      return {
        allowed: false,
        policyVersion: "unknown",
        reason: `policy gate error — failing closed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async preconditions(req: SandboxRequest): Promise<string | null> {
    if (!(await this.deps.runtime.isAvailable())) {
      return "container runtime is unavailable";
    }
    const net = await this.deps.runtime.networkInfo(this.config.labNetwork);
    if (!net.exists) {
      return `lab network ${this.config.labNetwork} does not exist`;
    }
    if (this.config.requireInternalNetwork && !net.internal) {
      return (
        `lab network ${this.config.labNetwork} is not internal — ` +
        `runner egress would not be contained; refusing to launch`
      );
    }
    // Pinned target image digest: the lab container currently serving the
    // alias must actually run the digest the scope approved. Fail closed on
    // missing, ambiguous, or mismatched service mapping.
    const svc = await this.deps.runtime.resolveServiceImage(
      this.config.labNetwork,
      req.targetServiceAlias,
    );
    if (svc.matchCount === 0) {
      return `no container serves alias ${req.targetServiceAlias} on ${this.config.labNetwork}`;
    }
    if (svc.matchCount > 1) {
      return `ambiguous target: ${svc.matchCount} containers claim alias ${req.targetServiceAlias}`;
    }
    const expected = normalizeDigest(req.targetImageDigest);
    const actual = new Set(
      [svc.imageId, ...svc.repoDigests]
        .filter((d): d is string => d !== null)
        .map(normalizeDigest),
    );
    if (!actual.has(expected)) {
      return (
        `target image digest mismatch: pinned ${expected} but running lab ` +
        `image is ${svc.imageId ?? "unknown"} — refusing to launch`
      );
    }
    return null;
  }

  private async runToCompletion(
    req: SandboxRequest,
    ctx: ExecuteContext,
    instance: RunnerInstance,
    token: string,
    deadlineMs: number,
    abortSignal: AbortSignal,
  ): Promise<ExecutedRun> {
    const runnerId = instance.id;
    const update = (patch: Partial<RunnerInstance>) => this.deps.registry.update(runnerId, patch);

    // --- create ---
    const args = buildDockerCreateArgs({
      runnerId,
      workspaceId: ctx.workspaceId,
      request: req,
      runnerImage: this.config.runnerImage,
      labNetwork: this.config.labNetwork,
      expiresAtEpoch: Math.floor((this.clock.now().getTime() + deadlineMs) / 1000),
    });
    let containerId: string;
    try {
      containerId = await this.deps.runtime.createContainer(args);
    } catch (err) {
      await update({
        status: "error",
        terminatedAt: this.clock.now().toISOString(),
        reason: `create failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      const runner = await this.mustGet(runnerId);
      return this.finishSync(req, runner, "failed", null, "container create failed", [], [], null);
    }
    await update({ sandboxId: containerId, status: "created" });

    const envelope = serializeEnvelope(
      buildRunnerEnvelope({
        runnerId,
        labOrigin: this.config.labOrigin,
        request: req,
        actorBearerToken: token,
      }),
    );

    // --- start + feed envelope over stdin ---
    let started: StartedContainer;
    try {
      started = await this.deps.runtime.startContainer(containerId, envelope);
      await update({ status: "running", startedAt: this.clock.now().toISOString() });
    } catch (err) {
      await update({
        status: "error",
        terminatedAt: this.clock.now().toISOString(),
        reason: `start failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      await this.destroyAndVerify(runnerId, containerId);
      const runner = await this.mustGet(runnerId);
      return this.finishSync(req, runner, "failed", null, "container start failed", [], [], null);
    }

    // --- wait with deadline watchdog + cancellation ---
    let outcome: ExecutionOutcome;
    const abortPromise = new Promise<"aborted">((resolve) => {
      if (abortSignal.aborted) resolve("aborted");
      else abortSignal.addEventListener("abort", () => resolve("aborted"), { once: true });
    });
    const deadline = delay(deadlineMs);
    const exitPromise = started.exited.then(() => "exited" as const);

    const race = await Promise.race([exitPromise, deadline.promise, abortPromise]);
    deadline.cancel();
    if (race === "deadline") {
      await this.deps.runtime.killContainer(containerId).catch(() => undefined);
      await update({ status: "stopping", reason: "deadline exceeded — SIGKILL" });
      outcome = "timeout";
    } else if (race === "aborted") {
      await this.deps.runtime.killContainer(containerId).catch(() => undefined);
      await update({ status: "forced_stop", reason: "canceled by orchestrator" });
      outcome = "killed";
    } else {
      outcome = "completed";
    }
    await started.exited.catch(() => undefined);

    const inspection = await this.deps.runtime.inspectContainer(containerId);
    const exitCode = inspection.exitCode;
    const parsed = parseRunnerOutput(started.stdout(), started.stderr(), req, runnerId);

    // --- containment evidence: mint ONLY from observed probe denials ---
    const breach = parsed.probes.some((p) => p.outcome === "breach");
    const events = this.mintContainmentEvents(req, ctx.workspaceId, instance, parsed.probes);
    let result = parsed.result;
    if (result !== null && events.length > 0) {
      result = { ...result, containmentEventIds: events.map((e) => e.id) };
    }
    if (breach && outcome === "completed") {
      outcome = "containment_breach";
    }
    if (outcome === "completed" && result === null) {
      outcome = "failed";
    }

    // --- destroy + verify cleanup (always) ---
    const cleanupVerified = await this.destroyAndVerify(runnerId, containerId);
    if (outcome === "containment_breach") {
      await update({
        status: "operator_alert",
        reason: "containment probe reported breach — sandbox boundary failed",
      });
    }
    if (exitCode !== null) {
      await update({ exitCode });
    }
    const finalRunner = await this.mustGet(runnerId);

    const finalOutcome: ExecutionOutcome =
      outcome === "containment_breach"
        ? "containment_breach"
        : !cleanupVerified
          ? "failed"
          : outcome;

    return this.finishSync(
      req,
      finalRunner,
      finalOutcome,
      result,
      parsed.resultError,
      events,
      parsed.probes,
      exitCode,
    );
  }

  /** Remove the container and PROVE it is gone. */
  private async destroyAndVerify(
    runnerId: RunnerInstanceId,
    containerId: string,
  ): Promise<boolean> {
    await this.deps.registry.update(runnerId, {
      status: "stopping",
      terminatedAt: this.clock.now().toISOString(),
    });
    await this.deps.runtime.removeContainer(containerId).catch(() => undefined);
    const gone = await this.verifyGone(containerId);
    await this.deps.registry.update(runnerId, {
      status: gone ? "cleanup_verified" : "error",
      ...(gone ? { cleanupVerifiedAt: this.clock.now().toISOString() } : {}),
      reason: gone ? null : "container still inspectable after docker rm — cleanup NOT verified",
    });
    return gone;
  }

  private async verifyGone(containerId: string): Promise<boolean> {
    // Double-check with a small settle; `docker rm` is synchronous but a
    // racing daemon can take a beat to drop the record.
    for (let i = 0; i < 3; i += 1) {
      const inspection = await this.deps.runtime.inspectContainer(containerId);
      if (!inspection.exists) return true;
      await wait(250);
    }
    return false;
  }

  private finishSync(
    req: SandboxRequest,
    runner: RunnerInstance,
    outcome: ExecutionOutcome,
    result: SandboxResult | null,
    resultError: string | null,
    events: ContainmentEvent[],
    probes: ParsedProbe[],
    exitCode: number | null,
  ): ExecutedRun {
    return {
      kind: "executed",
      request: req,
      runner,
      outcome,
      result,
      resultError,
      containmentEvents: events,
      probes,
      exitCode,
    };
  }

  /**
   * ContainmentEvent minting — the ONLY place events are created.
   * A probe reporting `denied` carries the observed errno/syscall detail;
   * `allowed` and `runtimeEnforced` are literal false/true by contract, and
   * this code is reached exclusively by observed runtime denial telemetry.
   */
  private mintContainmentEvents(
    req: SandboxRequest,
    workspaceId: WorkspaceId,
    instance: RunnerInstance,
    probes: ParsedProbe[],
  ): ContainmentEvent[] {
    const events: ContainmentEvent[] = [];
    for (const probe of probes) {
      if (probe.outcome !== "denied" || probe.ruleId === null) continue;
      const candidate = {
        id: randomUUID(),
        workspaceId,
        scanId: req.scanId,
        attemptId: req.attemptId,
        runnerId: instance.id,
        ruleId: probe.ruleId,
        policyVersion: "runtime:hardened-runner",
        deniedOperation: probe.operation,
        allowed: false,
        runtimeEnforced: true,
        observedAt: probe.at,
        safeSummary: `Runtime denied ${probe.operation} in runner (${probe.detail})`.slice(0, 280),
        safeMetadata: { probe: probe.probe, detail: probe.detail },
      };
      const parsed = ContainmentEventSchema.safeParse(candidate);
      if (parsed.success) events.push(parsed.data);
    }
    return events;
  }

  /**
   * Janitor — reconcile managed containers against the registry.
   * Kills/removes anything labeled ours that is expired, unknown, or left
   * behind by a crashed worker. Marks registry rows that lost their container.
   */
  async reconcileOrphans(now = this.clock.now()): Promise<ReapReport> {
    const report: ReapReport = { inspected: 0, reaped: [], markedLost: [], errors: [] };
    let containers;
    try {
      containers = await this.deps.runtime.listManagedContainers(
        LABEL_MANAGED_BY,
        LABEL_MANAGED_BY_VALUE,
      );
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
      return report;
    }

    const active = new Map((await this.deps.registry.listActive()).map((r) => [r.id, r]));
    const nowEpoch = Math.floor(now.getTime() / 1000);

    for (const container of containers) {
      report.inspected += 1;
      const runnerId = (container.labels[LABEL_RUNNER_ID] ?? null) as RunnerInstanceId | null;
      const expiresAt = Number(container.labels[LABEL_EXPIRES_AT] ?? "0");
      const row = runnerId !== null ? active.get(runnerId) : undefined;
      const expired = expiresAt > 0 && expiresAt < nowEpoch;
      const orphan = row === undefined || expired;

      if (!orphan && !container.running) {
        // Known, unexpired, already stopped — still must not linger.
      }
      if (orphan || !container.running) {
        try {
          if (container.running) {
            await this.deps.runtime.killContainer(container.containerId);
          }
          await this.deps.runtime.removeContainer(container.containerId);
          report.reaped.push({ containerId: container.containerId, runnerId });
          if (row !== undefined && runnerId !== null) {
            await this.deps.registry.update(runnerId, {
              status: "forced_stop",
              terminatedAt: now.toISOString(),
              reason: expired ? "reaped: exceeded deadline" : "reaped: orphaned container",
            });
          }
        } catch (err) {
          report.errors.push(
            `${container.containerId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // Registry rows claiming to be live whose containers are gone.
    for (const row of active.values()) {
      const stillThere = containers.some((c) => c.containerId === row.sandboxId);
      if (!stillThere) {
        await this.deps.registry.update(row.id, {
          status: "error",
          terminatedAt: now.toISOString(),
          reason: "container vanished while runner was active — marked lost",
        });
        report.markedLost.push(row.id);
      }
    }
    return report;
  }
}
