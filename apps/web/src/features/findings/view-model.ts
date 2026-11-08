/**
 * Findings/replays view-model builders (L10).
 *
 * PURE and client-safe: no network, no Node APIs, no oracle imports.
 * Copy strings follow docs/experience/09_UX_COPY_AND_CONTENT.md verbatim.
 *
 * Authority rule (zero fake badges): `canDisplayVerifiedFixed` returns
 * true ONLY for a server-stated `verified_fixed` replay verdict. There is
 * no code path that assigns that status from client state, props, or
 * defaults — pass the server verdict or nothing.
 */

import type { ReplayVerdict } from "@highcastle/contracts";
import type { AttemptRecord, ExperienceMode, FixGuidance, ProofLeg, ReplayRecord } from "./types";

export function canDisplayVerifiedFixed(
  serverVerdict: ReplayVerdict | null | undefined,
): serverVerdict is "verified_fixed" {
  return serverVerdict === "verified_fixed";
}

export function verdictExplainer(verdict: ReplayVerdict): string {
  switch (verdict) {
    case "verified_fixed":
      return "The original cross-account check no longer reproduces, and the legitimate invoice workflow still works.";
    case "still_vulnerable":
      return "The same unauthorized read is still possible in the test app.";
    case "regression":
      return "The unauthorized read stopped, but a legitimate workflow also broke.";
    case "inconclusive":
      return "We couldn't verify the patch outcome from the available evidence.";
  }
}

export function attemptVerdictExplainer(
  verdict: AttemptRecord["verdict"],
  mode: ExperienceMode,
): string {
  if (verdict === "reproduced") {
    return mode === "builder"
      ? "A test customer could read another test customer's invoice."
      : "Cross-account invoice read reproduced — broken object-level authorization.";
  }
  if (verdict === "not_reproduced") {
    return "The cross-account read was denied while the legitimate read worked.";
  }
  return "The test did not establish whether this weakness exists. Try again after fixing the test setup.";
}

export function invariantCopy(mode: ExperienceMode): { title: string; body: string } {
  if (mode === "builder") {
    return {
      title: "The rule that was broken",
      body: "A customer should only ever see their own invoices. The test app looked up an invoice by its ID alone and forgot to check who was asking, so Alice could open Bob's private invoice.",
    };
  }
  return {
    title: "Broken invariant: object-level authorization",
    body: "GET /api/invoices/:id resolved the object by ID alone with no tenant/ownership predicate on the read path (CWE-639). Fix: scope every invoice lookup to the authenticated actor's tenant and return 404 for cross-tenant IDs so misses are indistinguishable from absent objects.",
  };
}

export interface FixInstructionText {
  title: string;
  body: string;
}

export interface FixAttemptRef {
  attemptId: string;
  packId: string;
  packVersion: string;
  targetRevision: string;
  fixtureVersion: string | null;
}

/** Copyable fix instructions assembled deterministically from evidence. */
export function buildFixInstructions(input: {
  title: string;
  fingerprint: string;
  attempt: FixAttemptRef;
  guidance: FixGuidance;
}): FixInstructionText {
  const lines = [
    `Finding: ${input.title} (${input.fingerprint})`,
    `Root cause: ${input.guidance.rootCause}`,
    "",
    "Required invariant:",
    ...input.guidance.requiredInvariants.map((rule) => `- ${rule}`),
    "",
    `Smallest fix: ${input.guidance.smallestFix}`,
    "",
    `Retest: ${input.guidance.testGuidance}`,
    "",
    `Evidence: attempt ${input.attempt.attemptId}, pack ${input.attempt.packId} v${input.attempt.packVersion},`,
    input.attempt.fixtureVersion === null
      ? `target ${input.attempt.targetRevision}.`
      : `target ${input.attempt.targetRevision}, fixture ${input.attempt.fixtureVersion}.`,
  ];
  return { title: "Copy fix instructions", body: lines.join("\n") };
}

export interface ComparisonRow {
  key: string;
  label: string;
  result: "pass" | "fail" | "denied" | "allowed" | "unknown";
  observed: string;
}

export interface ComparisonSide {
  label: string;
  environment: string;
  rows: ComparisonRow[];
  summary: string;
}

function legRow(leg: ProofLeg, kind: "own" | "cross"): ComparisonRow {
  const actor = kind === "own" ? "Alice → own invoice" : "Alice → Bob invoice";
  if (leg.status === 200 && leg.identity !== null) {
    // Data returned. On the cross leg that IS the vulnerability, so it
    // renders as a failure however the side is labeled.
    if (kind === "cross") {
      return {
        key: `${leg.leg}-${leg.status}`,
        label: actor,
        result: "fail",
        observed: `HTTP 200 · ${leg.identity.id} owned by ${leg.identity.ownerId} (unauthorized)`,
      };
    }
    return {
      key: `${leg.leg}-${leg.status}`,
      label: actor,
      result: "allowed",
      observed: `HTTP 200 · ${leg.identity.id} owned by ${leg.identity.ownerId}`,
    };
  }
  if (leg.status === 403 || leg.status === 404) {
    return {
      key: `${leg.leg}-${leg.status}`,
      label: actor,
      result: "denied",
      observed: `HTTP ${leg.status} · no invoice data returned`,
    };
  }
  return {
    key: `${leg.leg}-${leg.status}`,
    label: actor,
    result: "unknown",
    observed: `HTTP ${leg.status} · ambiguous evidence`,
  };
}

function packSummary(record: AttemptRecord): string {
  return `Pack ${record.packId} v${record.packVersion} · attempt ${record.attemptId} · target ${record.targetRevision}`;
}

export interface BeforeAfterComparison {
  before: ComparisonSide;
  after: ComparisonSide;
}

export interface LiveAfterInput {
  label: string;
  environment: string;
  summary: string;
  /** Legitimate own-invoice read still works (server-stated). */
  positivePassed: boolean | null;
  /** Cross-account read denied (server-stated). */
  negativeDenied: boolean | null;
}

export interface StoredSideInput {
  label: string;
  environment: string;
  summary: string;
  /** Legitimate own-invoice read still works (server-stated). */
  positive: boolean | null;
  /** Cross-account read denied (server-stated). */
  negativeDenied: boolean | null;
}

function controlRows(
  ownKey: string,
  crossKey: string,
  positive: boolean | null,
  negativeDenied: boolean | null,
): [ComparisonRow, ComparisonRow] {
  const ownRow: ComparisonRow =
    positive === true ?
      {
        key: ownKey,
        label: "Alice → own invoice",
        result: "allowed",
        observed: "Legitimate read passed (server assertion).",
      }
    : positive === false ?
      {
        key: ownKey,
        label: "Alice → own invoice",
        result: "fail",
        observed: "Legitimate read failed (server assertion).",
      }
    : {
        key: ownKey,
        label: "Alice → own invoice",
        result: "unknown",
        observed: "Legitimate read outcome unavailable.",
      };
  const crossRow: ComparisonRow =
    negativeDenied === true ?
      {
        key: crossKey,
        label: "Alice → Bob invoice",
        result: "denied",
        observed: "Cross-account read denied (server assertion).",
      }
    : negativeDenied === false ?
      {
        key: crossKey,
        label: "Alice → Bob invoice",
        result: "fail",
        observed: "Cross-account read returned data (server assertion).",
      }
    : {
        key: crossKey,
        label: "Alice → Bob invoice",
        result: "unknown",
        observed: "Cross-account outcome unavailable.",
      };
  return [ownRow, crossRow];
}

/**
 * Comparison between two STORED sides (no recorded bodies on either
 * side). Every cell renders a server-stated control outcome — unknown
 * booleans render as unknown, never as passing.
 */
export function buildStoredComparison(
  before: StoredSideInput,
  after: StoredSideInput,
): BeforeAfterComparison {
  const [beforeOwn, beforeCross] = controlRows("before-P1", "before-S1", before.positive, before.negativeDenied);
  const [afterOwn, afterCross] = controlRows("after-P1", "after-S1", after.positive, after.negativeDenied);
  return {
    before: {
      label: before.label,
      environment: before.environment,
      rows: [beforeOwn, beforeCross],
      summary: before.summary,
    },
    after: {
      label: after.label,
      environment: after.environment,
      rows: [afterOwn, afterCross],
      summary: after.summary,
    },
  };
}

/**
 * Live-run comparison: the before side shows recorded evidence, the after
 * side shows ONLY what the server replay row states. Unknown booleans
 * render as unknown — never as passing.
 */
export function buildLiveComparison(
  before: AttemptRecord,
  after: LiveAfterInput,
): BeforeAfterComparison {
  const ownRow: ComparisonRow =
    after.positivePassed === true
      ? {
          key: "after-P1",
          label: "Alice → own invoice",
          result: "allowed",
          observed: "Legitimate read passed (server assertion).",
        }
      : after.positivePassed === false
        ? {
            key: "after-P1",
            label: "Alice → own invoice",
            result: "fail",
            observed: "Legitimate read failed (server assertion).",
          }
        : {
            key: "after-P1",
            label: "Alice → own invoice",
            result: "unknown",
            observed: "Legitimate read outcome unavailable.",
          };
  const crossRow: ComparisonRow =
    after.negativeDenied === true
      ? {
          key: "after-S1",
          label: "Alice → Bob invoice",
          result: "denied",
          observed: "Cross-account read denied (server assertion).",
        }
      : after.negativeDenied === false
        ? {
            key: "after-S1",
            label: "Alice → Bob invoice",
            result: "fail",
            observed: "Cross-account read returned data (server assertion).",
          }
        : {
            key: "after-S1",
            label: "Alice → Bob invoice",
            result: "unknown",
            observed: "Cross-account outcome unavailable.",
          };
  return {
    before: {
      label: `Before · ${before.targetRevision} (vulnerable)`,
      environment: `fixture ${before.fixtureVersion}`,
      rows: [legRow(before.baseline, "own"), legRow(before.crossAccount, "cross")],
      summary: packSummary(before),
    },
    after: {
      label: after.label,
      environment: after.environment,
      rows: [ownRow, crossRow],
      summary: after.summary,
    },
  };
}

/**
 * Before/after comparison from two recorded attempts. Labels describe
 * OBSERVED outcomes only; the verdict banner is chosen by the caller from
 * the server replay verdict via `canDisplayVerifiedFixed`.
 */
export function buildComparison(
  before: AttemptRecord,
  after: AttemptRecord,
): BeforeAfterComparison {
  return {
    before: {
      label: `Before · ${before.targetRevision} (vulnerable)`,
      environment: `fixture ${before.fixtureVersion}`,
      rows: [legRow(before.baseline, "own"), legRow(before.crossAccount, "cross")],
      summary: packSummary(before),
    },
    after: {
      label: `After · ${after.targetRevision} (patched)`,
      environment: `fixture ${after.fixtureVersion}`,
      rows: [legRow(after.baseline, "own"), legRow(after.crossAccount, "cross")],
      summary: packSummary(after),
    },
  };
}

export function replayForDisplay(replay: ReplayRecord | null): {
  headline: string;
  detail: string;
  showVerified: boolean;
} {
  if (replay === null) {
    return {
      headline: "No replay has run for this finding yet.",
      detail: "Run verification against the updated test app to compare before and after.",
      showVerified: false,
    };
  }
  return {
    headline: verdictExplainer(replay.verdict),
    detail: `Replay ${replay.replayId} · original attempt ${replay.originalAttemptId} · patched ${replay.patchedRevision}.`,
    showVerified: canDisplayVerifiedFixed(replay.verdict),
  };
}
