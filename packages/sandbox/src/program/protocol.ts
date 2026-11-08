/**
 * Runner wire protocol — the ONLY channel between the trusted controller and
 * the ephemeral runner process.
 *
 * Input: one JSON `RunnerEnvelope` document on stdin (never argv, never env —
 * secrets stay out of `docker inspect` and proc environ files).
 * Output: NDJSON lines on stdout; the final line MUST be a `result` line.
 *
 * Everything the runner emits is untrusted data to the controller: it is
 * parsed, bounded and validated against `@highcastle/contracts` before use.
 *
 * This file is dependency-free on purpose. The runner image contains this
 * program and nothing else — no package installs, no network beyond the lab.
 */

import type { ContainmentRuleId, SandboxRequest, SandboxResult } from "@highcastle/contracts";

export const RUNNER_PROTOCOL_VERSION = 1 as const;

/** Secrets resolved controller-side; delivered over stdin only. */
export interface RunnerSecrets {
  /** Synthetic lab fixture bearer token, e.g. `lab-token-alice`. */
  actorBearerToken: string;
}

export interface RunnerEnvelope {
  protocolVersion: typeof RUNNER_PROTOCOL_VERSION;
  /** RunnerInstanceId minted by the controller; echoed into the result. */
  runnerId: string;
  /**
   * Lab base URL chosen by the controller. The program still enforces its own
   * origin allowlist — a tampered envelope can only pick a lab address.
   */
  labOrigin: string;
  request: SandboxRequest;
  secrets: RunnerSecrets;
  /**
   * Pattern A: model-authored guest source authorized by the controller.
   * Present ⇒ the runner executes it via the constrained `lab.get` API in a
   * `node:vm` context INSIDE the hardened container — never on the host.
   */
  program?: { language: "js-subset-v1"; source: string };
}

// --- stdout line shapes ---

/** `denied`: operation blocked by a runtime mechanism (errno/syscall observed). */
export type ProbeOutcome = "denied" | "observed" | "breach" | "error" | "skipped";

export interface RunnerLineBase {
  v: typeof RUNNER_PROTOCOL_VERSION;
  at: string;
}

export interface StartedLine extends RunnerLineBase {
  type: "started";
  runnerId: string;
  packId: string;
  packVersion: string;
}

export interface ProbeLine extends RunnerLineBase {
  type: "probe";
  /** Stable probe identifier, e.g. `egress_ip`, `rootfs_write`. */
  probe: string;
  /** Machine-readable attempted operation, e.g. `tcp_connect:169.254.169.254:80`. */
  operation: string;
  /** Contract rule this denial maps to; null for audits/skips. */
  ruleId: ContainmentRuleId | null;
  outcome: ProbeOutcome;
  /** Bounded, sanitized detail: errno/operation observed. Never raw output. */
  detail: string;
}

export interface ExchangeLine extends RunnerLineBase {
  type: "exchange";
  exchange: {
    method: string;
    path: string;
    status: number;
    bodyHash: string;
    bodyExcerptRedacted?: string;
  };
}

export interface AssertionLine extends RunnerLineBase {
  type: "assertion";
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * `observation` — raw observed step response, the L15 oracle handoff.
 * Carries the parsed lab body (synthetic fixture data — never credentials)
 * so `adjudicateAttempt(BolaAttemptInput)` can adjudicate REAL facts rather
 * than trusting runner-computed assertion booleans.
 */
export interface ObservationLine extends RunnerLineBase {
  type: "observation";
  step: "health" | "ready" | "meta" | "whoami" | "own_invoice" | "cross_invoice" | "program";
  status: number;
  body: unknown;
  revisionEcho: string | null;
}

/**
 * `program_result` — Pattern A execution outcome: status, bounded redacted
 * return value, and the request budget actually consumed. Real output
 * evidence, not a claim.
 */
export interface ProgramResultLine extends RunnerLineBase {
  type: "program_result";
  status: "ok" | "program_error" | "budget_exceeded" | "timeout" | "denied";
  output: string;
  requestsMade: number;
  durationMs: number;
  programSha256: string;
}

export interface LogLine extends RunnerLineBase {
  type: "log";
  level: "info" | "warn" | "error";
  msg: string;
}

export interface ResultLine extends RunnerLineBase {
  type: "result";
  result: SandboxResult;
}

export type RunnerLine =
  | StartedLine
  | ProbeLine
  | ExchangeLine
  | AssertionLine
  | ObservationLine
  | ProgramResultLine
  | LogLine
  | ResultLine;
