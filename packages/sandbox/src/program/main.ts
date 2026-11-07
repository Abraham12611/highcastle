/**
 * Runner entrypoint — the fixed program the ephemeral container executes.
 *
 * Flow: parse stdin envelope → containment probes → abort on breach →
 * execute the allowlisted pack → emit a single final `result` line → exit.
 *
 * There is exactly one pack (`bola-invoice-v1`). The envelope may only name
 * it; a model cannot introduce commands, hosts, flags or new programs here.
 *
 * Exit codes: 0 = ran to completion (result line emitted, assertions may be
 * pass or fail — that's evidence, not an error); 2 = envelope unusable;
 * 3 = containment breach detected, pack aborted.
 */

import { readFileSync } from "node:fs";

import { RUNNER_PROTOCOL_VERSION, type RunnerEnvelope } from "./protocol.ts";
import { runContainmentProbes } from "./probes.ts";
import { runBolaInvoiceV1 } from "./pack.ts";
import { emit, nowIso, readStdin, truncate } from "./util.ts";
import { assertAllowedLabOrigin } from "./http.ts";
import type { SandboxResult } from "@highcastle/contracts";

const EXPECTED_PACK_ID = "bola-invoice-v1";
const EXPECTED_PACK_VERSION = "1.0.0";

function log(level: "info" | "warn" | "error", msg: string): void {
  emit({ v: 1, type: "log", at: nowIso(), level, msg: truncate(msg, 500) });
}

function emitResult(result: SandboxResult): void {
  emit({ v: 1, type: "result", at: nowIso(), result });
}

function readPeakRssMb(): number | null {
  try {
    // cgroup v2 (container peak); falls back to process high-water mark.
    const peak = readFileSync("/sys/fs/cgroup/memory.peak", "utf8").trim();
    const parsed = Number(peak);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed / (1024 * 1024));
  } catch {
    // fall through to process metric
  }
  try {
    return Math.max(1, Math.round(process.memoryUsage().rss / (1024 * 1024)));
  } catch {
    return null;
  }
}

function baseResult(
  envelope: RunnerEnvelope,
  status: SandboxResult["status"],
  exitCode: number | null,
  wallMs: number,
): SandboxResult {
  return {
    schemaVersion: 1,
    attemptId: envelope.request.attemptId,
    runnerId: envelope.runnerId as SandboxResult["runnerId"],
    nonce: envelope.request.nonce,
    status,
    exitCode,
    baselineAssertion: { passed: false, detail: "pack did not run" },
    negativeAssertion: { passed: false, detail: "pack did not run" },
    exchanges: [],
    resourceUsage: { wallMs, maxRssMb: readPeakRssMb(), requestsMade: 0 },
    containmentEventIds: [],
    artifactDigests: [],
    completedAt: nowIso(),
  };
}

async function main(): Promise<number> {
  const started = Date.now();

  const raw = await readStdin();
  let envelope: RunnerEnvelope;
  try {
    envelope = JSON.parse(raw) as RunnerEnvelope;
  } catch {
    process.stderr.write("runner: envelope is not valid JSON\n");
    return 2;
  }

  // Structural sanity — the controller already Zod-validated; the program
  // still refuses a malformed or foreign envelope (fail closed).
  if (
    envelope.protocolVersion !== RUNNER_PROTOCOL_VERSION ||
    typeof envelope.runnerId !== "string" ||
    typeof envelope.labOrigin !== "string" ||
    envelope.request?.packId !== EXPECTED_PACK_ID ||
    envelope.request?.packVersion !== EXPECTED_PACK_VERSION ||
    typeof envelope.secrets?.actorBearerToken !== "string" ||
    envelope.secrets.actorBearerToken.length === 0
  ) {
    process.stderr.write("runner: envelope failed structural checks\n");
    return 2;
  }

  try {
    assertAllowedLabOrigin(envelope.labOrigin);
  } catch (err) {
    process.stderr.write(`runner: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  emit({
    v: 1,
    type: "started",
    at: nowIso(),
    runnerId: envelope.runnerId,
    packId: EXPECTED_PACK_ID,
    packVersion: EXPECTED_PACK_VERSION,
  });

  // --- Containment probes: real forbidden operations, real kernel answers ---
  const probes = await runContainmentProbes();
  const breaches = probes.filter((p) => p.outcome === "breach");
  // Dev-smoke escape hatch: outside a container the probes correctly report
  // breaches (no sandbox exists). HC_DEV_UNSANDBOXED=1 lets a developer run
  // the pack against a locally-hosted lab anyway — the controller never sets
  // this inside the image, and probe lines still record the true outcomes.
  const devUnsandboxed = process.env["HC_DEV_UNSANDBOXED"] === "1";
  if (breaches.length > 0 && !devUnsandboxed) {
    log(
      "error",
      `containment breach detected (${breaches.map((b) => b.probe).join(", ")}); aborting pack`,
    );
    const result = baseResult(envelope, "failed", 3, Date.now() - started);
    emitResult(result);
    return 3;
  }
  if (breaches.length > 0) {
    log(
      "warn",
      `HC_DEV_UNSANDBOXED=1: continuing despite probe breaches (${breaches
        .map((b) => b.probe)
        .join(", ")}) — this run is NOT containment evidence`,
    );
  }

  // --- Execute the single approved pack ---
  const pack = await runBolaInvoiceV1(
    envelope.labOrigin,
    envelope.secrets.actorBearerToken,
    envelope.request.limits.maxRequests,
  );
  if (pack.inconclusiveReason !== null) {
    log("warn", `run not interpretable: ${pack.inconclusiveReason}`);
  }

  const result: SandboxResult = {
    schemaVersion: 1,
    attemptId: envelope.request.attemptId,
    runnerId: envelope.runnerId as SandboxResult["runnerId"],
    nonce: envelope.request.nonce,
    status: "completed",
    exitCode: 0,
    baselineAssertion: pack.baselineAssertion,
    negativeAssertion: pack.negativeAssertion,
    exchanges: pack.exchanges,
    observedFixtureOwner: pack.observedFixtureOwner,
    resourceUsage: {
      wallMs: Date.now() - started,
      maxRssMb: readPeakRssMb(),
      requestsMade: pack.requestsMade,
    },
    containmentEventIds: [],
    artifactDigests: [],
    completedAt: nowIso(),
  };
  if (pack.fatalError !== null) {
    result.status = "failed";
    result.exitCode = 1;
  }
  emitResult(result);
  return result.exitCode ?? 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(
      `runner: unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
