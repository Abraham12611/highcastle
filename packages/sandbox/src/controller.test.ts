/**
 * Controller lifecycle tests against a scripted fake runtime.
 *
 * These tests verify orchestration truth — ordering, denial, cancellation,
 * cleanup proof, containment minting — but NOT kernel isolation (that needs
 * the Docker integration suite / Vultr host).
 */

import { describe, expect, it } from "vitest";

import type { RunnerInstanceId, WorkspaceId } from "@highcastle/contracts";

import { SandboxController, type SandboxControllerConfig } from "./controller.ts";
import { InMemoryRunnerRegistry } from "./registry.ts";
import { StaticSyntheticCredentialResolver, CREDENTIAL_REFS } from "./credentials.ts";
import { StaticLabPolicyGate } from "./policy.ts";
import {
  FakeRuntime,
  FixedCredentialResolver,
  makeRequest,
  probeLine,
  resultLine,
  ScriptedPolicyGate,
  ThrowingPolicyGate,
} from "./testkit/fakes.ts";
import type { CredentialResolver, SandboxPolicyGate } from "./ports.ts";

const WS = "11111111-2222-4333-8444-555555555555" as WorkspaceId;

interface Harness {
  controller: SandboxController;
  runtime: FakeRuntime;
  registry: InMemoryRunnerRegistry;
}

function harness(
  opts: {
    runtime?: FakeRuntime;
    gate?: SandboxPolicyGate;
    resolver?: CredentialResolver;
    config?: Partial<SandboxControllerConfig>;
  } = {},
): Harness {
  const runtime = opts.runtime ?? new FakeRuntime();
  const registry = new InMemoryRunnerRegistry();
  const controller = new SandboxController({
    runtime,
    registry,
    policyGate: opts.gate ?? new StaticLabPolicyGate(),
    credentialResolver: opts.resolver ?? new FixedCredentialResolver(),
    ...(opts.config !== undefined ? { config: opts.config } : {}),
  });
  return { controller, runtime, registry };
}

function completedRun(
  request: ReturnType<typeof makeRequest>,
  extraProbeLines: string[] = [],
): (id: string, stdin: string, handle: import("./testkit/fakes.ts").FakeStartedContainer) => void {
  return (_id, _stdin, handle) => {
    const runnerId = (JSON.parse(_stdin) as { runnerId: string }).runnerId as RunnerInstanceId;
    const lines = [...extraProbeLines, resultLine(request, runnerId)];
    handle.pushStdout(lines.join("\n") + "\n");
    handle.finish();
  };
}

describe("execute — happy path", () => {
  it("creates, runs, mints containment events, destroys and verifies cleanup", async () => {
    const request = makeRequest();
    const probes = [
      probeLine(
        "egress_ip",
        "tcp_connect:169.254.169.254:80",
        "network.egress_denied",
        "denied",
        "ENETUNREACH",
      ),
      probeLine(
        "rootfs_write",
        "fs_write:/usr/local/x",
        "filesystem.access_denied",
        "denied",
        "EROFS",
      ),
      probeLine(
        "uid_nonroot",
        "audit:process.getuid",
        "process.limit_enforced",
        "observed",
        "uid=1000",
      ),
    ];
    const runtime = new FakeRuntime({ onStart: completedRun(request, probes) });
    const { controller, registry } = harness({ runtime });

    const exec = await controller.execute(request, { workspaceId: WS });

    expect(exec.kind).toBe("executed");
    if (exec.kind !== "executed") return;
    expect(exec.outcome).toBe("completed");
    expect(exec.result).not.toBeNull();
    expect(exec.result?.nonce).toBe(request.nonce);

    // Containment: two denied probes -> two events; audit probe -> none.
    expect(exec.containmentEvents).toHaveLength(2);
    expect(exec.containmentEvents[0]?.ruleId).toBe("network.egress_denied");
    expect(exec.containmentEvents[0]?.allowed).toBe(false);
    expect(exec.containmentEvents[0]?.runtimeEnforced).toBe(true);
    expect(exec.containmentEvents[0]?.deniedOperation).toBe("tcp_connect:169.254.169.254:80");
    expect(exec.result?.containmentEventIds).toEqual(exec.containmentEvents.map((e) => e.id));

    // Lifecycle: exactly one create, one start(stdin), one rm, verified gone.
    expect(runtime.createdArgs).toHaveLength(1);
    expect(runtime.removed).toHaveLength(1);
    const row = exec.runner;
    expect(row.status).toBe("cleanup_verified");
    expect(row.startedAt).not.toBeNull();
    expect(row.terminatedAt).not.toBeNull();
    expect(row.cleanupVerifiedAt).not.toBeNull();
    expect(await registry.get(row.id)).toMatchObject({ status: "cleanup_verified" });
  });

  it("sends the secret over stdin only — never in docker args", async () => {
    const request = makeRequest();
    let capturedStdin = "";
    const runtime = new FakeRuntime({
      onStart: (_id, stdin, handle) => {
        capturedStdin = stdin;
        completedRun(request)(_id, stdin, handle);
      },
    });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(request, { workspaceId: WS });
    expect(exec.kind).toBe("executed");

    const argsJoined = runtime.createdArgs[0]!.join(" ");
    expect(argsJoined).not.toContain("lab-token-alice");
    expect(capturedStdin).toContain("lab-token-alice");
    expect(capturedStdin).toContain(request.nonce);
  });
});

describe("execute — denial and preconditions", () => {
  it("policy denial creates no container", async () => {
    const gate = new ScriptedPolicyGate({
      allowed: false,
      policyVersion: "v9",
      reason: "scope revoked",
    });
    const runtime = new FakeRuntime();
    const { controller } = harness({ gate, runtime });

    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("denied");
    if (exec.kind === "denied") expect(exec.decision.reason).toBe("scope revoked");
    expect(runtime.createdArgs).toHaveLength(0);
  });

  it("fails closed when the policy gate throws", async () => {
    const runtime = new FakeRuntime();
    const { controller } = harness({ gate: new ThrowingPolicyGate(), runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("denied");
    if (exec.kind === "denied") expect(exec.decision.reason).toContain("failing closed");
    expect(runtime.createdArgs).toHaveLength(0);
  });

  it("refuses to launch when the runtime is unavailable", async () => {
    const runtime = new FakeRuntime({ available: false });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("precondition_failed");
    expect(runtime.createdArgs).toHaveLength(0);
  });

  it("refuses to launch on a non-internal lab network", async () => {
    const runtime = new FakeRuntime({ network: { exists: true, internal: false } });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("precondition_failed");
    if (exec.kind === "precondition_failed") expect(exec.reason).toContain("not internal");
    expect(runtime.createdArgs).toHaveLength(0);
  });

  it("refuses to launch when the lab network is missing", async () => {
    const runtime = new FakeRuntime({ network: { exists: false, internal: false } });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("precondition_failed");
  });

  it("refuses to launch on an unresolvable credential ref", async () => {
    const runtime = new FakeRuntime();
    const { controller } = harness({
      runtime,
      resolver: new StaticSyntheticCredentialResolver(),
    });
    const exec = await controller.execute(
      makeRequest({ actorCredentialRef: "ref:synthetic:eve_session" }),
      { workspaceId: WS },
    );
    expect(exec.kind).toBe("precondition_failed");
    expect(runtime.createdArgs).toHaveLength(0);
  });

  it("refuses to launch on target image digest mismatch", async () => {
    const runtime = new FakeRuntime({
      serviceImage: { matchCount: 1, imageId: "sha256:" + "f".repeat(64), repoDigests: [] },
    });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("precondition_failed");
    if (exec.kind === "precondition_failed") expect(exec.reason).toContain("digest mismatch");
    expect(runtime.createdArgs).toHaveLength(0);
  });

  it("refuses to launch when no container serves the target alias", async () => {
    const runtime = new FakeRuntime({
      serviceImage: { matchCount: 0, imageId: null, repoDigests: [] },
    });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("precondition_failed");
    if (exec.kind === "precondition_failed") expect(exec.reason).toContain("no container serves alias");
  });

  it("refuses to launch on ambiguous alias mapping", async () => {
    const runtime = new FakeRuntime({
      serviceImage: { matchCount: 2, imageId: "sha256:" + "c".repeat(64), repoDigests: [] },
    });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("precondition_failed");
    if (exec.kind === "precondition_failed") expect(exec.reason).toContain("ambiguous");
  });

  it("accepts a matching digest via repoDigests as well as image id", async () => {
    const runtime = new FakeRuntime({
      serviceImage: {
        matchCount: 1,
        imageId: "sha256:" + "0".repeat(64),
        repoDigests: ["highcastle/target-lab@sha256:" + "c".repeat(64)],
      },
      onStart: completedRun(makeRequest()),
    });
    const { controller } = harness({ runtime });
    // request pins "c"*64 which matches the repoDigest, not the config id.
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("executed");
  });

  it("alice/bob refs resolve through the static resolver", async () => {
    const resolver = new StaticSyntheticCredentialResolver();
    await expect(resolver.resolve(CREDENTIAL_REFS.alice)).resolves.toBe("lab-token-alice");
    await expect(resolver.resolve(CREDENTIAL_REFS.bob)).resolves.toBe("lab-token-bob");
  });
});

describe("execute — timeouts, cancellation, failure", () => {
  it("SIGKILLs at the deadline and reports timeout", async () => {
    const runtime = new FakeRuntime({
      onStart: (_id, _stdin, _handle) => {
        // Never exits — simulates a runaway runner.
      },
    });
    const { controller } = harness({ runtime, config: { timeoutGraceMs: 60 } });
    const request = makeRequest();
    request.limits = { ...request.limits, maxDurationSeconds: 1 };

    const exec = await controller.execute(request, { workspaceId: WS });
    expect(exec.kind).toBe("executed");
    if (exec.kind !== "executed") return;
    expect(exec.outcome).toBe("timeout");
    expect(runtime.killed).toHaveLength(1);
    expect(runtime.removed).toHaveLength(1);
    expect(exec.runner.status).toBe("cleanup_verified");
    expect(exec.result).toBeNull();
  }, 10_000);

  it("kills on cooperative cancellation and reports killed", async () => {
    const runtime = new FakeRuntime({ onStart: () => undefined });
    const { controller } = harness({ runtime });
    const abort = new AbortController();
    const request = makeRequest();

    const promise = controller.execute(request, { workspaceId: WS, signal: abort.signal });
    setTimeout(() => abort.abort(), 50);
    const exec = await promise;

    expect(exec.kind).toBe("executed");
    if (exec.kind !== "executed") return;
    expect(exec.outcome).toBe("killed");
    expect(runtime.killed).toHaveLength(1);
    expect(exec.runner.status).toBe("cleanup_verified");
  }, 10_000);

  it("marks failed when the runner exits without a valid result", async () => {
    const runtime = new FakeRuntime({
      onStart: (_id, _stdin, handle) => {
        handle.pushStdout("garbage\n");
        handle.pushStderr("runner exploded");
        handle.finish();
      },
    });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("executed");
    if (exec.kind !== "executed") return;
    expect(exec.outcome).toBe("failed");
    expect(exec.result).toBeNull();
    expect(exec.resultError).toContain("no result line");
    expect(exec.runner.status).toBe("cleanup_verified");
  });

  it("escalates to operator_alert on a containment breach", async () => {
    const request = makeRequest();
    const runtime = new FakeRuntime({
      onStart: (_id, _stdin, handle) => {
        const env = JSON.parse(_stdin) as { runnerId: string };
        const lines = [
          probeLine(
            "egress_http",
            "http_get:example.com:80",
            "network.egress_denied",
            "breach",
            "HTTP 200",
          ),
          resultLine(request, env.runnerId as RunnerInstanceId, { status: "failed", exitCode: 3 }),
        ];
        handle.pushStdout(lines.join("\n") + "\n");
        handle.finish();
      },
    });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(request, { workspaceId: WS });
    expect(exec.kind).toBe("executed");
    if (exec.kind !== "executed") return;
    expect(exec.outcome).toBe("containment_breach");
    expect(exec.containmentEvents).toHaveLength(0);
    expect(exec.runner.status).toBe("operator_alert");
    expect(exec.runner.cleanupVerifiedAt).not.toBeNull();
  });

  it("handles container create failure honestly", async () => {
    const runtime = new FakeRuntime({ createFails: "image not found" });
    const { controller } = harness({ runtime });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("executed");
    if (exec.kind !== "executed") return;
    expect(exec.outcome).toBe("failed");
    expect(exec.runner.status).toBe("error");
    expect(exec.runner.reason).toContain("create failed");
  });
});

describe("janitor — reconcileOrphans", () => {
  it("reaps expired/unknown managed containers and marks lost rows", async () => {
    const lostRunnerId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" as RunnerInstanceId;
    const expired = {
      containerId: "deadbeef0001",
      name: "hc-sb-expired",
      labels: {
        "highcastle.managed-by": "l14-sandbox-controller",
        "highcastle.runner-id": "99999999-8888-4777-8666-555555555555",
        "highcastle.expires-at": "1",
      },
      running: true,
    };
    const runtime = new FakeRuntime({ managedContainers: [expired] });
    const registry = new InMemoryRunnerRegistry();
    const controller = new SandboxController({
      runtime,
      registry,
      policyGate: new StaticLabPolicyGate(),
      credentialResolver: new FixedCredentialResolver(),
    });
    // A registry row that claims to be running but has no container.
    await registry.create({
      id: lostRunnerId,
      workspaceId: WS,
      scanId: makeRequest().scanId,
      sandboxId: "gonecontainer",
      imageDigest: "img",
      networkProfile: "net",
      limits: makeRequest().limits,
      status: "running",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      terminatedAt: null,
      cleanupVerifiedAt: null,
      timeoutAt: null,
      exitCode: null,
      reason: null,
    });

    const report = await controller.reconcileOrphans(new Date("2027-01-01T00:00:00Z"));
    expect(report.inspected).toBe(1);
    expect(report.reaped).toHaveLength(1);
    expect(runtime.killed).toContain("deadbeef0001");
    expect(runtime.removed).toContain("deadbeef0001");
    expect(report.markedLost).toContain(lostRunnerId);
    const row = await registry.get(lostRunnerId);
    expect(row?.status).toBe("error");
  });
});
