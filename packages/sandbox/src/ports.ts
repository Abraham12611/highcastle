/**
 * Ports — the seams other lanes plug into.
 *
 * The controller depends on these interfaces only; every dependency is
 * injected, which is what lets unit tests exercise the full lifecycle against
 * a fake runtime while production drives the Docker CLI.
 *
 * Owners:
 * - L04 / L13 → `SandboxPolicyGate` (deterministic scope/plan intersection)
 * - L02       → `RunnerRegistry` (durable persistence of runner_instances)
 * - L16       → consumes `SandboxController` from orchestration flows
 */

import type { RunnerInstance, RunnerInstanceId, SandboxRequest } from "@highcastle/contracts";

// --- Policy gate (L04 decision interface) ---

export interface PolicyDecision {
  allowed: boolean;
  /** Policy/ruleset version recorded on containment events and denials. */
  policyVersion: string;
  /** Human-safe reason code/detail when denied. */
  reason?: string;
}

/**
 * Deterministic pre-execution authorization. The controller calls this AFTER
 * Zod-validating the request and BEFORE creating any container — and the
 * orchestrator is expected to have already gated the plan upstream (defense
 * in depth, not the primary boundary). A thrown error or a missing decision
 * is treated as deny by the caller.
 */
export interface SandboxPolicyGate {
  authorize(request: SandboxRequest): Promise<PolicyDecision>;
}

// --- Credential resolution ---

/**
 * Resolves an opaque `actorCredentialRef` to the synthetic lab token it names.
 * Implementations must only ever return synthetic fixture credentials — the
 * contract type makes real secret values inexpressible upstream.
 */
export interface CredentialResolver {
  resolve(actorCredentialRef: string): Promise<string>;
}

// --- Container runtime ---

export interface NetworkInfo {
  exists: boolean;
  /** Docker network `Internal` flag — no outbound route when true. */
  internal: boolean;
}

export interface ContainerInspection {
  exists: boolean;
  running: boolean;
  exitCode: number | null;
}

export interface ManagedContainer {
  containerId: string;
  name: string;
  labels: Record<string, string>;
  running: boolean;
}

/**
 * Resolution of a service alias on a network to the image behind it.
 * `matchCount`: how many containers on the network claim the alias —
 * 0 = missing, 1 = unambiguous, >1 = ambiguous (fail closed).
 */
export interface ServiceImageResolution {
  matchCount: number;
  /** Image config id (sha256:...) of the single matched container, if any. */
  imageId: string | null;
  /** RepoDigests of that image, when inspectable. */
  repoDigests: string[];
}

/**
 * Minimal container-runtime surface the lifecycle needs. The Docker
 * implementation builds every flag in `dockerArgs.ts` — callers (and the
 * model, transitively) can never shape daemon arguments.
 */
export interface ContainerRuntime {
  /** Discriminator for evidence honesty — e.g. "docker". */
  readonly kind: string;
  isAvailable(): Promise<boolean>;
  networkInfo(name: string): Promise<NetworkInfo>;
  /** `docker create <args>` — args come from buildDockerCreateArgs only. */
  createContainer(createArgs: string[]): Promise<string>;
  /**
   * Start the container with stdin attached; write `stdinPayload` then close.
   * Resolves a handle whose `exited` promise settles when the container exits
   * (the attached process ending). Streams are captured on the handle.
   */
  startContainer(containerId: string, stdinPayload: string): Promise<StartedContainer>;
  killContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
  inspectContainer(containerId: string): Promise<ContainerInspection>;
  /** All containers (any state) carrying the given label `key=value`. */
  listManagedContainers(labelKey: string, labelValue: string): Promise<ManagedContainer[]>;
  /**
   * Find containers attached to `network` that claim DNS alias `alias`
   * (checked via each container's NetworkSettings alias list), and report
   * the image identity behind it for pinned-digest verification.
   */
  resolveServiceImage(network: string, alias: string): Promise<ServiceImageResolution>;
}

export interface StartedContainer {
  /** Resolves when the container's attached stdio session ends. */
  exited: Promise<void>;
  /** Stdout captured so far (grows until `exited` settles). */
  stdout(): string;
  stderr(): string;
}

// --- Runner registry (L02 will back this with runner_instances rows) ---

export interface RunnerRegistry {
  create(instance: RunnerInstance): Promise<void>;
  update(id: RunnerInstanceId, patch: Partial<RunnerInstance>): Promise<void>;
  get(id: RunnerInstanceId): Promise<RunnerInstance | null>;
  /** Non-terminal instances the janitor should reconcile. */
  listActive(): Promise<RunnerInstance[]>;
  listAll(): Promise<RunnerInstance[]>;
}

// --- Utilities ---

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
