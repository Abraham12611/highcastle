/**
 * Containment profile invariants — every hardening flag is pinned by a test.
 * If a flag is dropped or weakened, CI fails here, not on the Vultr host.
 */

import { describe, expect, it } from "vitest";

import type { RunnerInstanceId, WorkspaceId } from "@highcastle/contracts";

import { buildDockerCreateArgs, runnerContainerName } from "./dockerArgs.ts";
import { makeRequest } from "./testkit/fakes.ts";

const WS = "11111111-2222-4333-8444-555555555555" as WorkspaceId;
const RUNNER = "99999999-8888-4777-8666-555555555555" as RunnerInstanceId;

function argsFor(overrides: Partial<Parameters<typeof makeRequest>[0]> = {}) {
  return buildDockerCreateArgs({
    runnerId: RUNNER,
    workspaceId: WS,
    request: makeRequest(overrides),
    runnerImage: "highcastle/runner@sha256:" + "e".repeat(64),
    labNetwork: "highcastle-lab",
    expiresAtEpoch: 1_800_000_000,
  });
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe("buildDockerCreateArgs — privilege containment", () => {
  it("runs non-root with all capabilities dropped and no-new-privileges", () => {
    const args = argsFor();
    expect(flagValue(args, "--user")).toBe("1000:1000");
    expect(flagValue(args, "--cap-drop")).toBe("ALL");
    expect(flagValue(args, "--security-opt")).toBe("no-new-privileges:true");
  });

  it("never passes privileged mode, userns host, or pid host", () => {
    const args = argsFor();
    expect(hasFlag(args, "--privileged")).toBe(false);
    expect(args).not.toContain("host");
    expect(flagValue(args, "--userns")).toBeUndefined();
    expect(flagValue(args, "--pid")).toBeUndefined();
    expect(flagValue(args, "--ipc")).toBeUndefined();
  });
});

describe("buildDockerCreateArgs — filesystem containment", () => {
  it("mounts a read-only root with a small noexec tmpfs scratch only", () => {
    const args = argsFor();
    expect(hasFlag(args, "--read-only")).toBe(true);
    const tmpfs = flagValue(args, "--tmpfs");
    expect(tmpfs).toBe("/tmp:rw,noexec,nosuid,nodev,size=64m");
  });

  it("never mounts host paths, volumes, or the docker socket", () => {
    const args = argsFor();
    for (const flag of ["-v", "--volume", "--mount", "--bind"]) {
      expect(hasFlag(args, flag)).toBe(false);
    }
    expect(args.join(" ")).not.toContain("docker.sock");
    expect(args.join(" ")).not.toContain("/var/run");
  });
});

describe("buildDockerCreateArgs — network containment", () => {
  it("joins exactly one network: the internal lab network", () => {
    const args = argsFor();
    const networkIndexes = args.flatMap((a, i) => (a === "--network" ? [i] : []));
    expect(networkIndexes).toHaveLength(1);
    expect(args[networkIndexes[0]! + 1]).toBe("highcastle-lab");
  });

  it("publishes no ports and adds no extra hosts or DNS overrides", () => {
    const args = argsFor();
    for (const flag of ["-p", "--publish", "--add-host", "--dns", "--dns-search", "--link"]) {
      expect(hasFlag(args, flag)).toBe(false);
    }
  });
});

describe("buildDockerCreateArgs — resource caps", () => {
  it("maps contract limits to cgroup caps", () => {
    const args = argsFor({
      limits: {
        maxDurationSeconds: 30,
        maxRequests: 8,
        maxMemoryMb: 256,
        maxCpuMillicores: 750,
        maxPids: 32,
      },
    });
    expect(flagValue(args, "--memory")).toBe("256m");
    expect(flagValue(args, "--memory-swap")).toBe("256m");
    expect(flagValue(args, "--cpus")).toBe("0.75");
    expect(flagValue(args, "--pids-limit")).toBe("32");
  });
});

describe("buildDockerCreateArgs — environment hygiene", () => {
  it("passes only the allowlisted env keys — no host env, no secrets", () => {
    const args = argsFor();
    const envs = args.flatMap((a, i) => (a === "--env" ? [args[i + 1]!] : []));
    expect(envs.sort()).toEqual(["HOME=/tmp", "NODE_ENV=production"].sort());
    const joined = args.join(" ");
    expect(joined).not.toContain("VULTR");
    expect(joined).not.toContain("TOKEN");
    expect(joined).not.toContain("SECRET");
    expect(joined).not.toContain("lab-token");
  });
});

describe("buildDockerCreateArgs — audit labels", () => {
  it("labels the container for the janitor and forensics", () => {
    const args = argsFor();
    const labels = args.flatMap((a, i) => (a === "--label" ? [args[i + 1]!] : []));
    const map = Object.fromEntries(labels.map((l) => l.split("=", 2) as [string, string]));
    expect(map["highcastle.managed-by"]).toBe("l14-sandbox-controller");
    expect(map["highcastle.runner-id"]).toBe(RUNNER);
    expect(map["highcastle.workspace-id"]).toBe(WS);
    expect(map["highcastle.attempt-id"]).toBeDefined();
    expect(map["highcastle.expires-at"]).toBe("1800000000");
  });
});

describe("runnerContainerName", () => {
  it("is deterministic, docker-legal and runner-scoped", () => {
    const name = runnerContainerName(RUNNER);
    expect(name).toMatch(/^hc-sb-[0-9a-f]{16}$/);
  });
});
