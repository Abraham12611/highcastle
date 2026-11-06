/**
 * Test doubles for the controller ports. The fake runtime records every
 * daemon interaction so tests can assert lifecycle order, and lets a test
 * script the container's behavior (stdout, exit timing, kill response).
 */

import { randomUUID } from "node:crypto";

import type { AttemptId, RunnerInstanceId, SandboxRequest, ScanId } from "@highcastle/contracts";

import type {
  ContainerInspection,
  ContainerRuntime,
  ManagedContainer,
  NetworkInfo,
  StartedContainer,
} from "../ports.ts";
import type { PolicyDecision, SandboxPolicyGate } from "../ports.ts";
import type { CredentialResolver } from "../ports.ts";

export function makeRequest(overrides: Partial<SandboxRequest> = {}): SandboxRequest {
  return {
    schemaVersion: 1,
    scanId: randomUUID() as ScanId,
    attemptId: randomUUID() as AttemptId,
    policyHash: "a".repeat(64),
    packId: "bola-invoice-v1",
    packVersion: "1.0.0",
    targetServiceAlias: "target-lab",
    actorCredentialRef: "ref:synthetic:alice_session",
    nonce: "b".repeat(32),
    permittedMethods: ["GET"],
    limits: {
      maxDurationSeconds: 30,
      maxRequests: 8,
      maxMemoryMb: 256,
      maxCpuMillicores: 500,
      maxPids: 32,
    },
    targetImageDigest: "sha256:" + "c".repeat(64),
    ...overrides,
  };
}

export function resultLine(
  request: SandboxRequest,
  runnerId: RunnerInstanceId,
  overrides: Record<string, unknown> = {},
): string {
  const result = {
    schemaVersion: 1,
    attemptId: request.attemptId,
    runnerId,
    nonce: request.nonce,
    status: "completed",
    exitCode: 0,
    baselineAssertion: { passed: true, detail: "own invoice read" },
    negativeAssertion: { passed: false, detail: "bob invoice returned" },
    exchanges: [
      {
        method: "GET",
        path: "/api/invoices/invoice_A",
        status: 200,
        bodyHash: "d".repeat(64),
      },
    ],
    observedFixtureOwner: "bob",
    resourceUsage: { wallMs: 120, maxRssMb: 42, requestsMade: 4 },
    containmentEventIds: [],
    artifactDigests: [],
    completedAt: new Date().toISOString(),
    ...overrides,
  };
  return JSON.stringify({ v: 1, type: "result", at: new Date().toISOString(), result });
}

export function probeLine(
  probe: string,
  operation: string,
  ruleId: string | null,
  outcome: string,
  detail = "probe detail",
): string {
  return JSON.stringify({
    v: 1,
    type: "probe",
    at: new Date().toISOString(),
    probe,
    operation,
    ruleId,
    outcome,
    detail,
  });
}

/** Scripted started-container handle. */
export class FakeStartedContainer implements StartedContainer {
  private resolveExit!: () => void;
  readonly exited: Promise<void>;
  private out = "";
  private err = "";

  constructor() {
    this.exited = new Promise<void>((r) => {
      this.resolveExit = r;
    });
  }

  stdout(): string {
    return this.out;
  }
  stderr(): string {
    return this.err;
  }
  pushStdout(text: string): void {
    this.out += text;
  }
  pushStderr(text: string): void {
    this.err += text;
  }
  finish(): void {
    this.resolveExit();
  }
}

export interface FakeRuntimeOptions {
  available?: boolean;
  network?: NetworkInfo;
  /** Called when the fake container is started — lets the test script output. */
  onStart?: (containerId: string, stdin: string, handle: FakeStartedContainer) => void;
  createFails?: string;
  startFails?: string;
  /** Containers reported by listManagedContainers (janitor input). */
  managedContainers?: ManagedContainer[];
}

export class FakeRuntime implements ContainerRuntime {
  readonly kind = "fake-docker";
  readonly createdArgs: string[][] = [];
  readonly killed: string[] = [];
  readonly removed: string[] = [];
  readonly startedStdin = new Map<string, string>();
  private readonly gone = new Set<string>();
  private readonly handles: FakeStartedContainer[] = [];
  private readonly opts: FakeRuntimeOptions;
  private nextId = 0;

  constructor(opts: FakeRuntimeOptions = {}) {
    this.opts = opts;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.opts.available ?? true);
  }

  networkInfo(_name: string): Promise<NetworkInfo> {
    return Promise.resolve(this.opts.network ?? { exists: true, internal: true });
  }

  createContainer(createArgs: string[]): Promise<string> {
    if (this.opts.createFails) return Promise.reject(new Error(this.opts.createFails));
    this.createdArgs.push(createArgs);
    this.nextId += 1;
    return Promise.resolve(`fakecontainer${String(this.nextId).padStart(12, "0")}`);
  }

  startContainer(containerId: string, stdinPayload: string): Promise<StartedContainer> {
    if (this.opts.startFails) return Promise.reject(new Error(this.opts.startFails));
    this.startedStdin.set(containerId, stdinPayload);
    const handle = new FakeStartedContainer();
    this.handles.push(handle);
    this.opts.onStart?.(containerId, stdinPayload, handle);
    return Promise.resolve(handle);
  }

  killContainer(containerId: string): Promise<void> {
    this.killed.push(containerId);
    // Real docker ends the attached session on SIGKILL.
    for (const h of this.handles) h.finish();
    return Promise.resolve();
  }

  removeContainer(containerId: string): Promise<void> {
    this.removed.push(containerId);
    this.gone.add(containerId);
    for (const h of this.handles) h.finish();
    return Promise.resolve();
  }

  inspectContainer(containerId: string): Promise<ContainerInspection> {
    if (this.gone.has(containerId)) {
      return Promise.resolve({ exists: false, running: false, exitCode: null });
    }
    return Promise.resolve({ exists: true, running: false, exitCode: 0 });
  }

  listManagedContainers(_k: string, _v: string): Promise<ManagedContainer[]> {
    return Promise.resolve(this.opts.managedContainers ?? []);
  }
}

export class ScriptedPolicyGate implements SandboxPolicyGate {
  calls: SandboxRequest[] = [];
  private readonly decision: PolicyDecision;
  constructor(decision: PolicyDecision) {
    this.decision = decision;
  }
  authorize(request: SandboxRequest): Promise<PolicyDecision> {
    this.calls.push(request);
    return Promise.resolve(this.decision);
  }
}

export class ThrowingPolicyGate implements SandboxPolicyGate {
  authorize(): Promise<PolicyDecision> {
    return Promise.reject(new Error("policy backend down"));
  }
}

export class FixedCredentialResolver implements CredentialResolver {
  resolved: string[] = [];
  private readonly token: string;
  constructor(token = "lab-token-alice") {
    this.token = token;
  }
  resolve(ref: string): Promise<string> {
    this.resolved.push(ref);
    return Promise.resolve(this.token);
  }
}
