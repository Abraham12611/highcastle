/**
 * Docker integration suite — REAL containment verification.
 *
 * These tests exercise the actual boundary: they build the runner image,
 * create an internal lab network, launch the real lab container, run the
 * controller end to end, and assert runtime-observed denials plus verified
 * cleanup. They are skipped (not faked) when Docker is unavailable — an
 * honest "not run" is better than a green illusion.
 *
 * Enable with: HIGHCASTLE_DOCKER_IT=1 (and a working docker daemon).
 * Required images/networks are created by infra/docker/runner/verify-containment.sh
 * or automatically by this suite when HIGHCASTLE_DOCKER_IT_SETUP=1.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

import type { WorkspaceId } from "@highcastle/contracts";

import { SandboxController } from "./controller.ts";
import { DockerCliRuntime } from "./dockerRuntime.ts";
import { InMemoryRunnerRegistry } from "./registry.ts";
import { StaticLabPolicyGate } from "./policy.ts";
import { StaticSyntheticCredentialResolver } from "./credentials.ts";
import { DEFAULT_LAB_NETWORK, LABEL_MANAGED_BY, LABEL_MANAGED_BY_VALUE } from "./constants.ts";
import { makeRequest } from "./testkit/fakes.ts";

const DOCKER_IT = process.env["HIGHCASTLE_DOCKER_IT"] === "1";
const RUNNER_IMAGE = process.env["HIGHCASTLE_RUNNER_IMAGE"] ?? "highcastle/runner:it";
const LAB_IMAGE = "highcastle/target-lab:it-vulnerable";
const WS = "11111111-2222-4333-8444-555555555555" as WorkspaceId;

function docker(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 120_000 });
}

describe.skipIf(!DOCKER_IT)("docker containment integration", () => {
  const runtime = new DockerCliRuntime();

  beforeAll(() => {
    // Internal-only lab network (no outbound route).
    try {
      docker(["network", "inspect", DEFAULT_LAB_NETWORK]);
    } catch {
      docker(["network", "create", "--internal", DEFAULT_LAB_NETWORK]);
    }
    // Lab reachable at alias `target-lab` only inside that network.
    try {
      docker(["rm", "-f", "hc-it-target-lab"]);
    } catch {
      /* not present */
    }
    docker([
      "run",
      "-d",
      "--name",
      "hc-it-target-lab",
      "--network",
      DEFAULT_LAB_NETWORK,
      "--network-alias",
      "target-lab",
      LAB_IMAGE,
    ]);
  }, 180_000);

  it("executes the pack and reports runtime-observed denials", async () => {
    const controller = new SandboxController({
      runtime,
      registry: new InMemoryRunnerRegistry(),
      policyGate: new StaticLabPolicyGate(),
      credentialResolver: new StaticSyntheticCredentialResolver(),
      config: { runnerImage: RUNNER_IMAGE },
    });
    const exec = await controller.execute(makeRequest(), { workspaceId: WS });
    expect(exec.kind).toBe("executed");
    if (exec.kind !== "executed") return;

    // The lab is reachable (positive control) and the pack produced evidence.
    expect(exec.result).not.toBeNull();
    expect(exec.result?.status).toBe("completed");
    expect(exec.result?.baselineAssertion.passed).toBe(true);

    // Runtime containment: at minimum the egress + rootfs probes denied.
    const denied = exec.containmentEvents.map((e) => e.ruleId);
    expect(denied).toContain("network.egress_denied");
    expect(denied).toContain("filesystem.access_denied");
    for (const ev of exec.containmentEvents) {
      expect(ev.allowed).toBe(false);
      expect(ev.runtimeEnforced).toBe(true);
    }
    expect(exec.outcome).toBe("completed");
    expect(exec.runner.status).toBe("cleanup_verified");
  }, 120_000);

  it("leaves no managed containers behind", () => {
    const ps = docker([
      "ps",
      "-a",
      "--filter",
      `label=${LABEL_MANAGED_BY}=${LABEL_MANAGED_BY_VALUE}`,
      "--format",
      "{{.ID}}",
    ]);
    expect(ps.trim()).toBe("");
  });
});
