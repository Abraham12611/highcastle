/**
 * Runner output parser — stdout is UNTRUSTED data (T7).
 *
 * The runner speaks NDJSON; the final `result` line carries the SandboxResult.
 * Everything is bounded and re-validated: malformed lines are dropped (not
 * trusted), the result must pass `SandboxResultSchema`, and the attemptId /
 * runnerId / nonce must echo the request — a mismatched result is discarded
 * rather than trusted.
 */

import {
  SandboxResultSchema,
  type ContainmentRuleId,
  type SandboxRequest,
  type SandboxResult,
} from "@highcastle/contracts";

import type { ProbeLine, ProbeOutcome } from "./program/protocol.ts";

export interface ParsedProbe {
  probe: string;
  operation: string;
  ruleId: ContainmentRuleId | null;
  outcome: ProbeOutcome;
  detail: string;
  at: string;
}

/** Pattern A: the guest program's real execution outcome. */
export interface ParsedProgramResult {
  status: "ok" | "program_error" | "budget_exceeded" | "timeout" | "denied";
  output: string;
  requestsMade: number;
  durationMs: number;
  programSha256: string;
  at: string;
}

const VALID_PROGRAM_STATUSES = new Set([
  "ok",
  "program_error",
  "budget_exceeded",
  "timeout",
  "denied",
]);

/** One observed step response — the L15 oracle handoff unit. */
export interface ParsedObservation {
  step: string;
  status: number;
  /** Parsed lab body (synthetic fixture data; bounded by the line cap). */
  body: unknown;
  revisionEcho: string | null;
  at: string;
}

export interface ParsedRunnerOutput {
  /** Well-formed probe lines only. */
  probes: ParsedProbe[];
  /** Well-formed observation lines for the independent oracle. */
  observations: ParsedObservation[];
  /** Pattern A guest outcome line, when the runner executed model-authored code. */
  programResult: ParsedProgramResult | null;
  /** Validated SandboxResult, or null when absent/invalid/mismatched. */
  result: SandboxResult | null;
  /** Why the result is absent, when it is. */
  resultError: string | null;
  /** Count of stdout lines that were not valid protocol JSON (bounded evidence). */
  malformedLines: number;
  /** Sanitized stderr excerpt for forensics (bounded). */
  stderrExcerpt: string;
}

const MAX_LINE_BYTES = 32 * 1024;
const VALID_RULE_IDS = new Set<string>([
  "network.egress_denied",
  "filesystem.access_denied",
  "resource.limit_enforced",
  "process.limit_enforced",
  "secret.access_denied",
]);
const VALID_OUTCOMES = new Set<string>(["denied", "observed", "breach", "error", "skipped"]);

const VALID_OBSERVATION_STEPS = new Set([
  "health",
  "ready",
  "meta",
  "whoami",
  "own_invoice",
  "cross_invoice",
  "program",
]);

function isObservationLine(v: Record<string, unknown>): boolean {
  return (
    v["type"] === "observation" &&
    typeof v["step"] === "string" &&
    VALID_OBSERVATION_STEPS.has(v["step"]) &&
    typeof v["status"] === "number" &&
    (v["revisionEcho"] === null || typeof v["revisionEcho"] === "string") &&
    typeof v["at"] === "string"
  );
}

function isProbeLine(value: unknown): value is ProbeLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v["type"] === "probe" &&
    typeof v["probe"] === "string" &&
    typeof v["operation"] === "string" &&
    v["operation"].length <= 200 &&
    typeof v["outcome"] === "string" &&
    VALID_OUTCOMES.has(v["outcome"]) &&
    typeof v["detail"] === "string" &&
    (v["ruleId"] === null ||
      (typeof v["ruleId"] === "string" && VALID_RULE_IDS.has(v["ruleId"]))) &&
    typeof v["at"] === "string"
  );
}

export function parseRunnerOutput(
  stdout: string,
  stderr: string,
  request: SandboxRequest,
  expectedRunnerId: string,
): ParsedRunnerOutput {
  const probes: ParsedProbe[] = [];
  const observations: ParsedObservation[] = [];
  let programResult: ParsedProgramResult | null = null;
  let result: SandboxResult | null = null;
  let resultError: string | null = null;
  let malformedLines = 0;
  let resultSeen = false;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.length > MAX_LINE_BYTES) {
      malformedLines += 1;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformedLines += 1;
      continue;
    }
    if (isProbeLine(parsed)) {
      probes.push({
        probe: parsed.probe,
        operation: parsed.operation.slice(0, 200),
        ruleId: parsed.ruleId,
        outcome: parsed.outcome,
        detail: parsed.detail.slice(0, 500),
        at: parsed.at,
      });
      continue;
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      isObservationLine(parsed as Record<string, unknown>)
    ) {
      const v = parsed as Record<string, unknown>;
      observations.push({
        step: v["step"] as string,
        status: v["status"] as number,
        body: v["body"],
        revisionEcho: v["revisionEcho"] as string | null,
        at: v["at"] as string,
      });
      continue;
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>)["type"] === "program_result"
    ) {
      const v = parsed as Record<string, unknown>;
      if (
        typeof v["status"] === "string" &&
        VALID_PROGRAM_STATUSES.has(v["status"]) &&
        typeof v["output"] === "string" &&
        typeof v["requestsMade"] === "number" &&
        typeof v["durationMs"] === "number" &&
        typeof v["programSha256"] === "string" &&
        v["programSha256"].length === 64 &&
        typeof v["at"] === "string"
      ) {
        programResult = {
          status: v["status"] as ParsedProgramResult["status"],
          output: v["output"].slice(0, 4096),
          requestsMade: v["requestsMade"],
          durationMs: v["durationMs"],
          programSha256: v["programSha256"],
          at: v["at"],
        };
      }
      continue;
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>)["type"] === "result"
    ) {
      resultSeen = true;
      const candidate = (parsed as Record<string, unknown>)["result"];
      const checked = SandboxResultSchema.safeParse(candidate);
      if (!checked.success) {
        resultError = `result failed schema validation: ${checked.error.issues[0]?.message ?? "invalid"}`;
        continue;
      }
      // Echo binding: a result that doesn't name this attempt/runner/nonce is
      // not evidence for this attempt — discard it.
      if (
        checked.data.attemptId !== request.attemptId ||
        checked.data.nonce !== request.nonce ||
        checked.data.runnerId !== expectedRunnerId
      ) {
        resultError = "result echo mismatch (attemptId/runnerId/nonce) — discarded";
        continue;
      }
      result = checked.data;
      continue;
    }
    // started/exchange/assertion/log lines are recorded evidence but carry no
    // trust decision here — they are ignored for control flow.
  }

  if (result === null && resultError === null) {
    resultError = resultSeen
      ? "result line present but unusable"
      : "no result line in runner output";
  }

  return {
    probes,
    observations,
    programResult,
    result,
    resultError,
    malformedLines,
    stderrExcerpt: stderr.slice(0, 2000),
  };
}
