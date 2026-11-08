/**
 * Orchestrator dependency bundle + in-process cancellation registry.
 *
 * Every port is injected — production wires real packages in
 * `../adapters/index.ts`, tests substitute in-memory implementations.
 */
import type {
  AttemptVerifier,
  Clock,
  InferencePlanner,
  JobQueue,
  OrchestratorStore,
  PolicyGate,
  SandboxExecutor,
  ScanEventPublisher,
} from "../adapters/ports.js";
import type { ExplanationClientLike } from "./explain-attempt.js";

/** Cooperative, in-process cancel signals (same-machine fast path). */
export class CancelRegistry {
  private readonly controllers = new Map<string, AbortController>();

  /** Register (or return the existing) abort controller for a scan. */
  register(scanId: string): AbortController {
    const existing = this.controllers.get(scanId);
    if (existing) return existing;
    const controller = new AbortController();
    this.controllers.set(scanId, controller);
    return controller;
  }

  /** Signal all runners on this scan to stop; keeps the registration. */
  abort(scanId: string): void {
    this.controllers.get(scanId)?.abort();
  }

  isAborted(scanId: string): boolean {
    return this.controllers.get(scanId)?.signal.aborted ?? false;
  }

  /** Drop the registration once the scan is terminal. */
  release(scanId: string): void {
    this.controllers.delete(scanId);
  }
}

export interface OrchestratorConfig {
  /**
   * Pinned lab image digest written onto every `SandboxRequest`
   * (`targetImageDigest`). Sourced from env/ops, never from a job payload
   * or model output — a changed digest must block the attempt upstream.
   */
  targetImageDigest: string;
  /** Max total hypothesis calls per scan before failing the plan stage. */
  maxModelReplans: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  targetImageDigest: "target-lab@sha256:unresolved-pending-l19",
  maxModelReplans: 2,
};

export interface OrchestratorDeps {
  store: OrchestratorStore;
  events: ScanEventPublisher;
  inference: InferencePlanner;
  /**
   * Post-oracle explanation caller (Engineer 8). Injected in tests;
   * production defaults to the server-configured Vultr client inside
   * the explanation service, which fails safe when unconfigured.
   */
  explainer?: ExplanationClientLike;
  policy: PolicyGate;
  sandbox: SandboxExecutor;
  verifier: AttemptVerifier;
  queue: JobQueue;
  clock: Clock;
  config: OrchestratorConfig;
  cancelRegistry: CancelRegistry;
}
