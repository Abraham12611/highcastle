/**
 * Findings & replay view models (L10).
 *
 * These are the UI's internal shapes, built from contracted API data
 * (`@highcastle/contracts`) or from the labeled synthetic demo source.
 * They carry ONLY observed/server-stated facts: the UI never invents a
 * verdict, a revision, or evidence. `verified_fixed` can only arrive
 * inside a server `Replay` row and is displayed through
 * `canDisplayVerifiedFixed` — never assigned by a component.
 */

import type {
  Confidence,
  FindingCategory,
  OracleVerdict,
  RemediationStatus,
  ReplayVerdict,
  Severity,
} from "@highcastle/contracts";

export type ExperienceMode = "builder" | "developer";

/** Where the rendered data came from — always shown, never hidden. */
export type DataSource = { kind: "api" } | { kind: "demo"; note: string };

export interface FindingSummary {
  id: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  confidence: Confidence;
  remediationStatus: RemediationStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ProofLeg {
  /** "P1" baseline or "S1" cross-account leg. */
  leg: "P1" | "S1";
  method: string;
  path: string;
  status: number;
  bodyHash: string;
  excerptRedacted: string;
  identity: { id: string; ownerId: string; tenantId: string } | null;
}

/** One executed attempt, as the server recorded it. */
export interface AttemptRecord {
  attemptId: string;
  scanId: string;
  packId: string;
  packVersion: string;
  oracleVersion: string;
  targetRevision: string;
  fixtureVersion: string;
  baseline: ProofLeg;
  crossAccount: ProofLeg;
  verdict: OracleVerdict;
  verdictReasons: string[];
}

export interface ReplayRecord {
  replayId: string;
  originalAttemptId: string;
  /** Null for live rows: the contract replay row carries scan IDs, not the replay attempt ID. */
  replayAttemptId: string | null;
  packVersion: string;
  originalRevision: string;
  patchedRevision: string;
  originalVerdict: OracleVerdict;
  replayAttemptVerdict: OracleVerdict;
  verdict: ReplayVerdict;
  completedAt: string | null;
  /**
   * Server-stated assertion outcomes (nullable until the replay finishes).
   * The ONLY inputs to the displayed comparison after a live run — never
   * inferred client-side beyond these booleans.
   */
  assertions: {
    /** Legitimate own-invoice read still works. */
    positivePassed: boolean | null;
    /** Cross-account read denied. */
    negativeDenied: boolean | null;
  } | null;
}

export interface FixGuidance {
  rootCause: string;
  smallestFix: string;
  requiredInvariants: string[];
  testGuidance: string;
  /** "api" when served by the BFF, "local" when assembled from evidence. */
  provenance: "api" | "local";
}

export interface FindingDetail {
  finding: FindingSummary & { summary: string; stableFingerprint: string };
  /**
   * Full recorded attempt. Null when the API does not (yet) serve
   * redacted legs — proof/replay/fix tabs render missing-evidence states
   * instead of inventing content.
   */
  attempt: AttemptRecord | null;
  fixGuidance: FixGuidance | null;
  /** Latest replay known for this finding, if any. */
  replay: ReplayRecord | null;
  /** Full recorded patched attempt — present for the demo record only. */
  patchedAttempt: AttemptRecord | null;
  replayDefaults: {
    patchedEnvironmentId: string;
    patchedRevision: string;
    authorizationScopeId: string;
  };
  source: DataSource;
}

/** Load outcome for any findings/replays fetch — every state is rendered. */
export type LoadState<T> =
  | { status: "ok"; data: T; source: DataSource }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "unavailable"; detail: string };
