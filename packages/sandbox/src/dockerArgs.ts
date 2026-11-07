/**
 * docker create argument builder — the entire containment profile.
 *
 * This is a pure function so every hardening property is unit-testable:
 * non-root, read-only rootfs, dropped caps, no-new-privileges, resource caps,
 * internal lab network, no host mounts, no docker socket, minimal env, and
 * janitor labels. NOTHING here is derived from model output: the inputs are
 * the Zod-validated SandboxRequest plus controller config.
 *
 * If you add an argument, add the invariant test that pins it.
 */

import type { RunnerInstanceId, SandboxRequest } from "@highcastle/contracts";

import {
  LABEL_ATTEMPT_ID,
  LABEL_EXPIRES_AT,
  LABEL_MANAGED_BY,
  LABEL_MANAGED_BY_VALUE,
  LABEL_POLICY_HASH,
  LABEL_RUNNER_ID,
  LABEL_SCAN_ID,
  LABEL_WORKSPACE_ID,
  RUNNER_ENV,
  RUNNER_GID,
  RUNNER_NAME_PREFIX,
  RUNNER_TMPFS,
  RUNNER_UID,
} from "./constants.ts";
import type { WorkspaceId } from "@highcastle/contracts";

export interface DockerCreateSpec {
  runnerId: RunnerInstanceId;
  workspaceId: WorkspaceId;
  request: SandboxRequest;
  runnerImage: string;
  labNetwork: string;
  /** Absolute deadline (ms epoch) for the janitor's orphan check. */
  expiresAtEpoch: number;
}

/** Deterministic container name: prefix + runner-id fragment. */
export function runnerContainerName(runnerId: RunnerInstanceId): string {
  return `${RUNNER_NAME_PREFIX}${runnerId.replaceAll("-", "").slice(0, 16)}`;
}

/**
 * Arguments for `docker create`. Order is stable for diffability in tests and
 * audit logs. The runner image's ENTRYPOINT is `node program/main.ts`; the
 * request/envelope goes over stdin (`--interactive` keeps it open).
 */
export function buildDockerCreateArgs(spec: DockerCreateSpec): string[] {
  const { request } = spec;
  const { limits } = request;
  const cpus = (limits.maxCpuMillicores / 1000).toString();

  return [
    "create",
    "--name",
    runnerContainerName(spec.runnerId),
    // stdin attached later by `docker start -ai`; envelope is fed there.
    "--interactive",
    // --- identity / audit labels (janitor + forensics) ---
    "--label",
    `${LABEL_MANAGED_BY}=${LABEL_MANAGED_BY_VALUE}`,
    "--label",
    `${LABEL_RUNNER_ID}=${spec.runnerId}`,
    "--label",
    `${LABEL_WORKSPACE_ID}=${spec.workspaceId}`,
    "--label",
    `${LABEL_SCAN_ID}=${request.scanId}`,
    "--label",
    `${LABEL_ATTEMPT_ID}=${request.attemptId}`,
    "--label",
    `${LABEL_POLICY_HASH}=${request.policyHash.slice(0, 16)}`,
    "--label",
    `${LABEL_EXPIRES_AT}=${spec.expiresAtEpoch}`,
    // --- network: internal lab network ONLY; no other interface ---
    "--network",
    spec.labNetwork,
    // --- privilege / filesystem containment ---
    "--user",
    `${RUNNER_UID}:${RUNNER_GID}`,
    "--read-only",
    "--tmpfs",
    RUNNER_TMPFS,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--init",
    // --- resource caps (cgroup) ---
    "--pids-limit",
    String(limits.maxPids),
    "--memory",
    `${limits.maxMemoryMb}m`,
    "--memory-swap",
    `${limits.maxMemoryMb}m`,
    "--cpus",
    cpus,
    // --- environment: explicit allowlist, never inherited ---
    ...RUNNER_ENV.flatMap((kv) => ["--env", kv]),
    // Stop quickly on `docker stop`; the controller SIGKILLs at the deadline.
    "--stop-timeout",
    "2",
    spec.runnerImage,
  ];
}
