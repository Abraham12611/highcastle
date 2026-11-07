/**
 * Independent verification oracle for bola-invoice-v1 (L15).
 *
 * PURE and deterministic: no network, no clock, no LLM input. Every
 * decision below is derived from observed HTTP facts (statuses, parsed
 * bodies, revision echoes) pinned against the trusted fixture copy in
 * `fixtures.ts`.
 *
 * Anti-false-positive rules (non-negotiable):
 * - HTTP 200 alone NEVER classifies anything. `reproduced` requires a 200
 *   whose body carries Bob's full protected identity
 *   (`invoice_B` + `user_B` + `tenant_B`, cross-tenant vs Alice).
 * - `not_reproduced` requires BOTH a passing P1 baseline AND a clean
 *   authorization denial (403/404 with NO invoice data in the body).
 * - Any failed precondition (wrong revision, fixture drift, baseline
 *   broken, 5xx, ambiguous body) forces `inconclusive`, even when the two
 *   legs superficially resemble a matrix row. An ungrounded verdict is a
 *   defect, not evidence.
 *
 * Verdict derivation reuses the canonical matrices from
 * `@highcastle/contracts` (`evaluateAttemptVerdict`,
 * `evaluateReplayVerdict`) — this module maps observations to assertion
 * outcomes but never redefines the matrices.
 */

import { evaluateAttemptVerdict, evaluateReplayVerdict } from "@highcastle/contracts";
import {
  KNOWN_INVOICE_IDS,
  TRUSTED_ACTORS,
  TRUSTED_FIXTURE_SET,
  TRUSTED_FIXTURE_VERSION,
  TRUSTED_INVOICES,
  type KnownInvoiceId,
} from "./fixtures.js";
import { BOLA_ORACLE_VERSION } from "./manifest.js";
import type {
  BolaAttemptAdjudication,
  BolaAttemptInput,
  BolaReplayAdjudication,
  ObservedHttpResponse,
  SelectedInvoiceEvidence,
} from "./types.js";

interface InvoiceIdentity {
  id: string;
  ownerId: string;
  tenantId: string;
  number: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extract `{id, ownerId, tenantId, number}` when the body wraps an invoice. */
export function invoiceIdentity(body: unknown): InvoiceIdentity | null {
  if (!isRecord(body)) return null;
  const invoice = body["invoice"];
  if (!isRecord(invoice)) return null;
  const { id, ownerId, tenantId, number } = invoice;
  if (
    typeof id !== "string" ||
    typeof ownerId !== "string" ||
    typeof tenantId !== "string" ||
    typeof number !== "string"
  ) {
    return null;
  }
  return { id, ownerId, tenantId, number };
}

/** Error code from the lab error envelope, or null when absent. */
export function labErrorCode(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const error = body["error"];
  if (!isRecord(error)) return null;
  return typeof error["code"] === "string" ? error["code"] : null;
}

function identityMatches(
  identity: InvoiceIdentity | null,
  expected: { id: string; ownerId: string; tenantId: string; number: string },
): boolean {
  return (
    identity !== null &&
    identity.id === expected.id &&
    identity.ownerId === expected.ownerId &&
    identity.tenantId === expected.tenantId &&
    identity.number === expected.number
  );
}

/**
 * P1 baseline: Alice's own-invoice read.
 * - `pass`: 200 AND the body carries Alice's full invoice identity.
 * - `fail`: definitive unhealthy baseline (auth denial on own read, or 200
 *   with a present-but-wrong identity — fixture corruption, not ambiguity).
 * - `unknown`: 5xx, rate limits, unparsable/empty 200, anything else.
 */
export function classifyBaseline(own: ObservedHttpResponse): {
  outcome: BolaAttemptAdjudication["baseline"];
  reason: string;
} {
  const identity = invoiceIdentity(own.body);
  if (own.status === 200 && identityMatches(identity, TRUSTED_INVOICES.invoice_A)) {
    return { outcome: "pass", reason: "P1 own-invoice read returned Alice identity" };
  }
  if (own.status === 401 || own.status === 403 || own.status === 404) {
    return {
      outcome: "fail",
      reason: `P1 own-invoice read denied (HTTP ${own.status})`,
    };
  }
  if (own.status === 200 && identity !== null) {
    return {
      outcome: "fail",
      reason: "P1 own-invoice read returned mismatched identity",
    };
  }
  return {
    outcome: "unknown",
    reason: `P1 own-invoice read ambiguous (HTTP ${own.status})`,
  };
}

/**
 * S1 security check: Alice's cross-account read of Bob's known invoice.
 * Assertion semantics follow the contract matrix: `pass` means the read
 * was DENIED, `fail` means Bob's data was RETURNED.
 * - `fail`: 200 AND the body carries Bob's full protected identity with a
 *   tenant different from Alice's. Status alone is never sufficient.
 * - `pass`: 403/404 AND the body carries NO invoice object (clean denial).
 * - `unknown`: everything else — 200 without owner proof, denial status
 *   WITH leaked invoice data, 401 (broken session, not an authz denial),
 *   5xx, unparsable bodies.
 */
export function classifySecurityCheck(cross: ObservedHttpResponse): {
  outcome: BolaAttemptAdjudication["securityCheck"];
  reason: string;
} {
  const identity = invoiceIdentity(cross.body);
  const bob = TRUSTED_INVOICES.invoice_B;
  const aliceTenant: string = TRUSTED_ACTORS.alice.tenantId;
  if (
    cross.status === 200 &&
    identityMatches(identity, bob) &&
    identity !== null &&
    identity.tenantId !== aliceTenant
  ) {
    return {
      outcome: "fail",
      reason: "S1 cross-account read returned Bob protected invoice",
    };
  }
  if ((cross.status === 403 || cross.status === 404) && identity === null) {
    return {
      outcome: "pass",
      reason: `S1 cross-account read denied (HTTP ${cross.status})`,
    };
  }
  if ((cross.status === 403 || cross.status === 404) && identity !== null) {
    return {
      outcome: "unknown",
      reason: `S1 denial status leaked invoice data (HTTP ${cross.status})`,
    };
  }
  if (cross.status === 200) {
    return {
      outcome: "unknown",
      reason: "S1 HTTP 200 without Bob identity proof",
    };
  }
  return {
    outcome: "unknown",
    reason: `S1 cross-account read ambiguous (HTTP ${cross.status})`,
  };
}

function stringField(body: unknown, key: string): string | null {
  if (!isRecord(body)) return null;
  const value = body[key];
  return typeof value === "string" ? value : null;
}

/**
 * P0 preconditions + P2 trusted-fixture cross-check.
 * P2 ("invoice_B belongs to Bob") is verified by comparing the lab's own
 * `/api/meta` fixture manifest against this pack's trusted copy — never
 * against model-generated text.
 */
export function checkPreconditions(input: BolaAttemptInput): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.health.status !== 200) {
    reasons.push(`P0 health check failed (HTTP ${input.health.status})`);
  } else if (input.health.revisionEcho !== input.expectedRevision) {
    reasons.push(`P0 revision mismatch (expected ${input.expectedRevision})`);
  }
  if (input.ready.status !== 200) {
    reasons.push(`P0 readiness check failed (HTTP ${input.ready.status})`);
  }
  if (input.meta.status !== 200) {
    reasons.push(`P0 fixture manifest unreachable (HTTP ${input.meta.status})`);
  } else {
    if (input.meta.revisionEcho !== input.expectedRevision) {
      reasons.push(`P0 manifest revision mismatch (expected ${input.expectedRevision})`);
    }
    if (stringField(input.meta.body, "fixtureVersion") !== TRUSTED_FIXTURE_VERSION) {
      reasons.push("P0 fixture version drift");
    }
    if (stringField(input.meta.body, "fixtureSet") !== TRUSTED_FIXTURE_SET) {
      reasons.push("P0 fixture set mismatch");
    }
    const manifestInvoices = isRecord(input.meta.body) ? input.meta.body["fixtures"] : null;
    const listed = isRecord(manifestInvoices) ? manifestInvoices["invoices"] : null;
    for (const id of KNOWN_INVOICE_IDS) {
      const expected = TRUSTED_INVOICES[id as KnownInvoiceId];
      const entry = Array.isArray(listed)
        ? listed.find((item) => isRecord(item) && item["id"] === id)
        : undefined;
      if (
        !isRecord(entry) ||
        entry["ownerId"] !== expected.ownerId ||
        entry["tenantId"] !== expected.tenantId
      ) {
        reasons.push(`P2 trusted fixture mismatch for ${id}`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Selected sanitized fields kept as evidence for one invoice response:
 * identity quad + revision echo. Never headers, never raw bodies.
 */
export function selectEvidenceFields(
  response: ObservedHttpResponse,
): SelectedInvoiceEvidence | null {
  const identity = invoiceIdentity(response.body);
  if (identity === null) return null;
  return { ...identity, revisionEcho: response.revisionEcho };
}

/**
 * Full attempt adjudication. When preconditions fail the verdict is forced
 * to `inconclusive` while the observed legs are still reported honestly —
 * a failed P0 grounds no matrix row.
 */
export function adjudicateAttempt(input: BolaAttemptInput): BolaAttemptAdjudication {
  const baseline = classifyBaseline(input.ownInvoice);
  const securityCheck = classifySecurityCheck(input.crossInvoice);
  const preconditions = checkPreconditions(input);
  const reasons = [...preconditions.reasons, baseline.reason, securityCheck.reason];
  const verdict = preconditions.ok
    ? evaluateAttemptVerdict({
        baseline: baseline.outcome,
        securityCheck: securityCheck.outcome,
      })
    : "inconclusive";
  return {
    attemptId: input.attemptId,
    oracleVersion: BOLA_ORACLE_VERSION,
    baseline: baseline.outcome,
    securityCheck: securityCheck.outcome,
    verdict,
    preconditionsOk: preconditions.ok,
    reasons,
  };
}

/**
 * Replay adjudication for the SAME versioned pack executed against the
 * patched target: cross-account denial + working own access →
 * `verified_fixed` (canonical matrix reused, not restated).
 *
 * Fail-closed gate (replay invariant): a patched run whose preconditions
 * did not hold — wrong pinned revision, fixture drift, failed session
 * setup, exceeded budget — grounds NO replay verdict. Even apparently
 * successful legs (baseline pass + cross-account denial) report
 * `inconclusive` when `preconditionsOk` is false, because the oracle
 * cannot tell which target it actually measured.
 */
export function adjudicateReplay(patchedRun: BolaAttemptAdjudication): BolaReplayAdjudication {
  if (!patchedRun.preconditionsOk) {
    return { attemptVerdict: patchedRun, replayVerdict: "inconclusive" };
  }
  const replayVerdict = evaluateReplayVerdict({
    legitimateRead: patchedRun.baseline,
    unauthorizedReadDenied: patchedRun.securityCheck,
    stillReadsCrossAccount: patchedRun.verdict === "reproduced",
  });
  return { attemptVerdict: patchedRun, replayVerdict };
}
