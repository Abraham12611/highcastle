/**
 * Containment probes — the runner deliberately attempts fixed, harmless,
 * FORBIDDEN operations and reports the *observed* runtime outcome.
 *
 * These are not simulations and not policy assertions. Each probe performs a
 * real syscall/network operation and classifies the kernel's answer:
 *
 * - `denied`   — the operation failed because of a sandbox mechanism (no route,
 *                read-only fs, missing mount, uid/capability). The controller
 *                mints a ContainmentEvent from these.
 * - `breach`   — the operation SUCCEEDED. Containment failed; the controller
 *                escalates the runner to `operator_alert`. Honest by design:
 *                run this program outside the sandbox and breaches are what
 *                you will see.
 * - `observed` — an audit fact (e.g. uid, env hygiene). Not a denial.
 * - `error`/`skipped` — probe could not reach a verdict (e.g. tool absent).
 *
 * Every probe is a compile-time constant: no probe target, path or command
 * comes from the envelope, the model, or the lab.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";

import type { ContainmentRuleId } from "@highcastle/contracts";
import { emit, nowIso, truncate } from "./util.ts";
import type { ProbeLine, ProbeOutcome } from "./protocol.ts";

interface ProbeResult {
  probe: string;
  operation: string;
  ruleId: ContainmentRuleId | null;
  outcome: ProbeOutcome;
  detail: string;
}

const PROBE_TIMEOUT_MS = 3_000;

/** Fixed harmless forbidden egress targets (compile-time constants). */
const FORBIDDEN_METADATA_IP = "169.254.169.254"; // cloud metadata endpoint
const FORBIDDEN_METADATA_PORT = 80;
const FORBIDDEN_EXTERNAL_HOST = "example.com"; // IANA documentation domain
const FORBIDDEN_EXTERNAL_PORT = 80;

/** Fixed filesystem targets. */
const ROOTFS_CANARY_PATH = "/usr/local/hc-containment-canary"; // read-only root
const DOCKER_SOCK_PATH = "/var/run/docker.sock"; // must never be mounted
const HOST_CANARY_PATH = "/opt/highcastle-host-secrets/canary.txt"; // host-only path
const SHADOW_PATH = "/etc/shadow"; // root-only file

function line(result: ProbeResult): ProbeLine {
  return { v: 1, type: "probe", at: nowIso(), ...result };
}

function errnoOf(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `${code}` : err.name;
  }
  return "unknown";
}

/** TCP connect to a fixed forbidden address; classify the kernel's answer. */
function probeEgressIp(): Promise<ProbeResult> {
  const probe = "egress_ip";
  const target = `${FORBIDDEN_METADATA_IP}:${FORBIDDEN_METADATA_PORT}`;
  return new Promise((resolve) => {
    const socket = net.connect({
      host: FORBIDDEN_METADATA_IP,
      port: FORBIDDEN_METADATA_PORT,
      timeout: PROBE_TIMEOUT_MS,
    });
    const done = (outcome: ProbeOutcome, detail: string) => {
      socket.destroy();
      resolve({
        probe,
        operation: `tcp_connect:${target}`,
        ruleId: "network.egress_denied",
        outcome,
        detail,
      });
    };
    socket.on("connect", () => done("breach", `tcp connect to ${target} succeeded`));
    socket.on("timeout", () => done("denied", `tcp connect to ${target} timed out (no route)`));
    socket.on("error", (err) => {
      const code = errnoOf(err);
      const deniedCodes = new Set([
        "ENETUNREACH",
        "EHOSTUNREACH",
        "ETIMEDOUT",
        "ECONNREFUSED",
        "ECONNRESET",
        "EPIPE",
        "EPERM",
      ]);
      done(deniedCodes.has(code) ? "denied" : "error", `tcp connect to ${target} failed: ${code}`);
    });
  });
}

/** HTTP GET to a fixed external hostname; classify DNS/connect outcome. */
function probeEgressHttp(): Promise<ProbeResult> {
  const probe = "egress_http";
  const target = `http://${FORBIDDEN_EXTERNAL_HOST}:${FORBIDDEN_EXTERNAL_PORT}/`;
  return new Promise((resolve) => {
    let settled = false;
    const done = (outcome: ProbeOutcome, detail: string) => {
      if (settled) return;
      settled = true;
      resolve({
        probe,
        operation: `http_get:${target}`,
        ruleId: "network.egress_denied",
        outcome,
        detail,
      });
    };
    const req = http.request(
      {
        hostname: FORBIDDEN_EXTERNAL_HOST,
        port: FORBIDDEN_EXTERNAL_PORT,
        path: "/",
        method: "GET",
        timeout: PROBE_TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        res.on("end", () => done("breach", `GET ${target} returned HTTP ${res.statusCode ?? 0}`));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      done("denied", `GET ${target} timed out (no route)`);
    });
    req.on("error", (err) => {
      const code = errnoOf(err);
      const deniedCodes = new Set([
        "ENOTFOUND",
        "EAI_AGAIN",
        "ENETUNREACH",
        "EHOSTUNREACH",
        "ETIMEDOUT",
        "ECONNREFUSED",
        "ECONNRESET",
        "EPIPE",
        "EPERM",
      ]);
      done(deniedCodes.has(code) ? "denied" : "error", `GET ${target} failed: ${code}`);
    });
    req.end();
  });
}

function probeRootfsWrite(): ProbeResult {
  try {
    fs.writeFileSync(ROOTFS_CANARY_PATH, "containment-probe\n", { flag: "wx" });
    fs.rmSync(ROOTFS_CANARY_PATH, { force: true });
    return {
      probe: "rootfs_write",
      operation: `fs_write:${ROOTFS_CANARY_PATH}`,
      ruleId: "filesystem.access_denied",
      outcome: "breach",
      detail: `write to ${ROOTFS_CANARY_PATH} succeeded — root filesystem is writable`,
    };
  } catch (err) {
    const code = errnoOf(err);
    const denied = code === "EROFS" || code === "EACCES" || code === "EPERM";
    return {
      probe: "rootfs_write",
      operation: `fs_write:${ROOTFS_CANARY_PATH}`,
      ruleId: "filesystem.access_denied",
      outcome: denied ? "denied" : "error",
      detail: `write to ${ROOTFS_CANARY_PATH} failed: ${code}`,
    };
  }
}

/**
 * Existence probe: if the path resolves at all inside the runner, something
 * was mounted that should not be — a breach regardless of readability.
 */
function probePathAbsent(
  probe: string,
  operation: string,
  ruleId: ContainmentRuleId,
  path: string,
  breachDetail: string,
): ProbeResult {
  try {
    fs.statSync(path);
    return { probe, operation, ruleId, outcome: "breach", detail: breachDetail };
  } catch (err) {
    const code = errnoOf(err);
    const denied = code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "ENOTDIR";
    return {
      probe,
      operation,
      ruleId,
      outcome: denied ? "denied" : "error",
      detail: `stat ${path} failed: ${code}`,
    };
  }
}

function probePathBlocked(
  probe: string,
  operation: string,
  ruleId: ContainmentRuleId,
  path: string,
  breachDetail: string,
): ProbeResult {
  try {
    fs.readFileSync(path);
    return { probe, operation, ruleId, outcome: "breach", detail: breachDetail };
  } catch (err) {
    const code = errnoOf(err);
    const denied = code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "ENOTDIR";
    return {
      probe,
      operation,
      ruleId,
      outcome: denied ? "denied" : "error",
      detail: `read ${path} failed: ${code}`,
    };
  }
}

/**
 * Attempt a mount-namespace operation. Requires CAP_SYS_ADMIN, which the
 * runner must not have (cap-drop ALL + no-new-privileges + seccomp).
 * Uses busybox `unshare`/`mknod` when present — these are the runner's own
 * fixed probe binaries inside the image, never external input.
 */
function probeCapability(): ProbeResult[] {
  const results: ProbeResult[] = [];
  const unshare = spawnSync("unshare", ["--mount", "true"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
  });
  if (unshare.error && (unshare.error as NodeJS.ErrnoException).code === "ENOENT") {
    results.push({
      probe: "cap_unshare_mount",
      operation: "proc_unshare:mount_namespace",
      ruleId: null,
      outcome: "skipped",
      detail: "unshare binary not present in runner image",
    });
  } else if (unshare.status === 0) {
    results.push({
      probe: "cap_unshare_mount",
      operation: "proc_unshare:mount_namespace",
      ruleId: "process.limit_enforced",
      outcome: "breach",
      detail: "unshare --mount succeeded — CAP_SYS_ADMIN appears present",
    });
  } else {
    const stderr = truncate((unshare.stderr ?? "").replace(/\n/g, " "), 160);
    results.push({
      probe: "cap_unshare_mount",
      operation: "proc_unshare:mount_namespace",
      ruleId: "process.limit_enforced",
      outcome: "denied",
      detail: `unshare --mount rejected (status ${String(unshare.status)}): ${stderr}`,
    });
  }

  const mknod = spawnSync("mknod", ["/tmp/hc-mknod-probe", "c", "1", "3"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
  });
  fs.rmSync("/tmp/hc-mknod-probe", { force: true });
  if (mknod.error && (mknod.error as NodeJS.ErrnoException).code === "ENOENT") {
    results.push({
      probe: "cap_mknod",
      operation: "fs_mknod:/tmp/hc-mknod-probe",
      ruleId: null,
      outcome: "skipped",
      detail: "mknod binary not present in runner image",
    });
  } else if (mknod.status === 0) {
    results.push({
      probe: "cap_mknod",
      operation: "fs_mknod:/tmp/hc-mknod-probe",
      ruleId: "process.limit_enforced",
      outcome: "breach",
      detail: "mknod succeeded — CAP_MKNOD appears present",
    });
  } else {
    const stderr = truncate((mknod.stderr ?? "").replace(/\n/g, " "), 160);
    results.push({
      probe: "cap_mknod",
      operation: "fs_mknod:/tmp/hc-mknod-probe",
      ruleId: "process.limit_enforced",
      outcome: "denied",
      detail: `mknod rejected (status ${String(mknod.status)}): ${stderr}`,
    });
  }
  return results;
}

/** Audit: effective uid must be non-zero (non-root enforcement). */
function probeUid(): ProbeResult {
  const getuid = process.getuid?.bind(process);
  if (!getuid) {
    return {
      probe: "uid_nonroot",
      operation: "audit:process.getuid",
      ruleId: null,
      outcome: "skipped",
      detail: "process.getuid unavailable on this platform",
    };
  }
  const uid = getuid();
  return {
    probe: "uid_nonroot",
    operation: "audit:process.getuid",
    ruleId: "process.limit_enforced",
    outcome: uid === 0 ? "breach" : "observed",
    detail: uid === 0 ? "runner is executing as uid 0 (root)" : `runner uid=${uid} (non-root)`,
  };
}

const ENV_DENYLIST =
  /(SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY|CREDENTIAL|VULTR|GITHUB|DATABASE|PGPASS)/i;
const ENV_ALLOW_KEYS = new Set([
  "HC_LAB_TOKEN_PRESENT", // marker set by controller instead of a raw env token
]);

/** Audit: no provider/DB/GitHub secrets may exist in the runner's env. */
function probeEnvHygiene(): ProbeResult {
  const leaks = Object.keys(process.env).filter(
    (key) => ENV_DENYLIST.test(key) && !ENV_ALLOW_KEYS.has(key),
  );
  return {
    probe: "env_secret_audit",
    operation: "audit:process.env",
    ruleId: "secret.access_denied",
    outcome: leaks.length === 0 ? "observed" : "breach",
    detail:
      leaks.length === 0
        ? "no secret-shaped variables present in runner environment"
        : `secret-shaped env vars present: ${leaks.join(",")}`,
  };
}

/**
 * Run every probe and emit one NDJSON line each. Returns the raw results so
 * main can decide whether a breach aborts the pack (it does — a breached
 * sandbox is not a valid test environment).
 */
export async function runContainmentProbes(): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  // Synchronous fs/capability probes first, then async egress probes.
  results.push(probeRootfsWrite());
  results.push(
    probePathAbsent(
      "docker_socket",
      `fs_stat:${DOCKER_SOCK_PATH}`,
      "filesystem.access_denied",
      DOCKER_SOCK_PATH,
      `${DOCKER_SOCK_PATH} exists in runner — docker socket is mounted`,
    ),
    probePathAbsent(
      "host_canary_file",
      `fs_stat:${HOST_CANARY_PATH}`,
      "filesystem.access_denied",
      HOST_CANARY_PATH,
      `${HOST_CANARY_PATH} exists in runner — host filesystem appears mounted`,
    ),
    probePathBlocked(
      "shadow_read",
      `fs_read:${SHADOW_PATH}`,
      "secret.access_denied",
      SHADOW_PATH,
      `read ${SHADOW_PATH} succeeded — root-only file readable`,
    ),
  );
  results.push(...probeCapability());
  results.push(probeUid(), probeEnvHygiene());
  results.push(await probeEgressIp(), await probeEgressHttp());
  for (const result of results) emit(line(result));
  return results;
}
