/**
 * Production dependency wiring. Assembles real adapters; throws
 * `IntegrationBlockedError` while any lane is unmerged so the worker
 * degrades honestly to health-shell instead of running on fakes.
 */
import { IntegrationBlockedError } from "./errors.js";
import { createSandboxExecutor, DbRunnerRegistry } from "./sandbox.js";
import { createDbPorts } from "./db-store.js";
import { createAttemptVerifier, createInferencePlanner, createSecurityPolicyGate } from "./real.js";
import {
  DEFAULT_ORCHESTRATOR_CONFIG,
  CancelRegistry,
  type OrchestratorDeps,
} from "../flows/deps.js";
import type { JobQueue } from "./ports.js";

export interface WireOptions {
  queue: JobQueue;
  env?: NodeJS.ProcessEnv;
}

/** Compose production deps; fails loudly naming the blocking lane. */
export function wireProductionDeps(options: WireOptions): OrchestratorDeps {
  const env = options.env ?? process.env;
  const { store, events, db } = createDbPorts(env);
  return {
    store,
    events,
    inference: createInferencePlanner(),
    policy: createSecurityPolicyGate(),
    // Container-only executor — no direct fallback in production. The
    // durable DbRunnerRegistry persists every runner lifecycle row so
    // cleanup/cancellation is auditable in runner_instances.
    sandbox: createSandboxExecutor({ registry: new DbRunnerRegistry(db) }),
    verifier: createAttemptVerifier(),
    queue: options.queue,
    clock: { now: () => new Date() },
    config: {
      ...DEFAULT_ORCHESTRATOR_CONFIG,
      targetImageDigest:
        env.HIGHCASTLE_TARGET_IMAGE_DIGEST ?? DEFAULT_ORCHESTRATOR_CONFIG.targetImageDigest,
    },
    cancelRegistry: new CancelRegistry(),
  };
}

export { IntegrationBlockedError };
