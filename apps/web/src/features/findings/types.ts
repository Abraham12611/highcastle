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
  /** Null when the server view does not carry it (replay created for a deleted attempt). */
  originalAttemptId: string | null;
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

export interface StoredEvidenceArtifact {
  id: string;
  artifactKind: string;
  sha256: string;
  byteSize: number;
  contentType: string;
}

/**
 * Stored execution record served by the BFF (occurrences + attempt
 * detail). Carries control outcomes, oracle verdict and evidence
 * metadata — never invented bodies. Rendered as-is; comparison rows
 * derive from its booleans via `buildStoredComparison`.
 */
export interface StoredAttempt {
  attemptId: string;
  scanId: string;
  packId: string;
  packVersion: string;
  targetRevision: string;
  verifierVerdict: OracleVerdict | null;
  positiveControlPassed: boolean | null;
  negativeSecurityConditionMet: boolean | null;
  observedAt: string | null;
  evidence: StoredEvidenceArtifact[];
}

export interface ReplayDefaults {
  patchedEnvironmentId: string;
  patchedRevision: string;
  authorizationScopeId: string;
  environmentLabel: string | null;
}

export interface FindingDetail {
  finding: FindingSummary & { summary: string; stableFingerprint: string };
  /**
   * Full recorded attempt with redacted legs. Present for the demo
   * record only — the live API serves rows, not bodies.
   */
  attempt: AttemptRecord | null;
  /** Stored attempts from the occurrences chain (actual server evidence). */
  storedAttempts: StoredAttempt[];
  fixGuidance: FixGuidance | null;
  /** Latest replay known for this finding, if any. */
  replay: ReplayRecord | null;
  /** Full recorded patched attempt — present for the demo record only. */
  patchedAttempt: AttemptRecord | null;
  /** Null until the scope endpoint resolves a real environment + scope. */
  replayDefaults: ReplayDefaults | null;
  source: DataSource;
}

/** Load outcome for any findings/replays fetch — every state is rendered. */
export type LoadState<T> =
  | { status: "ok"; data: T; source: DataSource }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "unavailable"; detail: string };
