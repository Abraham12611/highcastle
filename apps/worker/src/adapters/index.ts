/**
 * Production dependency wiring. Assembles real adapters; throws
 * `IntegrationBlockedError` while any lane is unmerged so the worker
 * degrades honestly to health-shell instead of running on fakes.
 */
import { IntegrationBlockedError } from "./errors.js";
import {
  createAttemptVerifier,
  createDbEventPublisher,
  createDbStore,
  createInferencePlanner,
  createSandboxExecutor,
  createSecurityPolicyGate,
} from "./blocked.js";
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
  return {
    store: createDbStore(),
    events: createDbEventPublisher(),
    inference: createInferencePlanner(),
    policy: createSecurityPolicyGate(),
    sandbox: createSandboxExecutor(),
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
