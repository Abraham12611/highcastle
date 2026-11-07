/**
 * HighCastle design tokens — TypeScript mirror.
 *
 * The union types below intentionally mirror the closed enums in
 * `@highcastle/contracts` (packages/contracts/src/enums.ts) so UI props
 * accept exact domain values without a runtime dependency on that
 * package. Contract enum changes require a coordinator-signed version
 * bump; update these unions in the same PR.
 *
 * HEX values must stay in sync with src/styles/tokens.css and
 * src/styles/theme.css — src/tokens.test.ts asserts parity.
 */

export const HC_COLORS = {
  bg: "#080D1A",
  surface1: "#10192A",
  surface2: "#18263B",
  surface3: "#22344C",
  line: "#30445B",
  lineStrong: "#46607F",
  text: "#EFF8F7",
  muted: "#9FB2C5",
  subtle: "#829CB2",
  primary: "#62F5D1",
  primaryDeep: "#0D5B58",
  primaryInk: "#052423",
  violet: "#A48BFF",
  violetDeep: "#3D3377",
  cyan: "#63CFFF",
  cyanDeep: "#134D6B",
  coral: "#FF708A",
  coralDeep: "#6B2033",
  orange: "#FFA66B",
  orangeDeep: "#6B3D1D",
  amber: "#FFD46B",
  amberDeep: "#5D4A1C",
  low: "#8CABC1",
  success: "#75E7B4",
  successDeep: "#14503B",
  focus: "#B8FFF0",
} as const;

export type HcColorName = keyof typeof HC_COLORS;

/**
 * Semantic tones used by pills, badges, timeline nodes and icons.
 * A tone is never the only carrier of meaning — every component pairs
 * it with an icon and a text label.
 */
export type Tone = "mint" | "success" | "cyan" | "violet" | "coral" | "orange" | "amber" | "slate";

// --- Domain value unions (mirror @highcastle/contracts) ---

export type Severity = "critical" | "high" | "medium" | "low" | "informational";

export type Confidence =
  | "suspected"
  | "supported_by_analysis"
  | "confirmed_by_execution"
  | "not_reproduced"
  | "inconclusive";

export type RemediationStatus =
  | "open"
  | "in_progress"
  | "pending_verification"
  | "verified_fixed"
  | "accepted_risk"
  | "dismissed"
  | "reopened";

export type OracleVerdict = "reproduced" | "not_reproduced" | "inconclusive";

export type ReplayVerdict = "verified_fixed" | "still_vulnerable" | "regression" | "inconclusive";

export type AssertionOutcome = "pass" | "fail" | "unknown";

export type ScanStatus =
  | "draft"
  | "preflight"
  | "awaiting_approval"
  | "queued"
  | "preparing"
  | "recon"
  | "planning"
  | "executing"
  | "verifying"
  | "finalizing"
  | "completed"
  | "partial"
  | "failed"
  | "canceled";

export type ScanPhase =
  "preparing" | "recon" | "planning" | "executing" | "verifying" | "finalizing";

export type ActorType =
  "user" | "model" | "worker" | "policy" | "runner" | "oracle" | "operator" | "system";

export type AttemptStatus =
  | "proposed"
  | "validated"
  | "blocked"
  | "queued"
  | "running"
  | "completed"
  | "timeout"
  | "failed"
  | "canceled";

export type EvidenceKind =
  | "redacted_request"
  | "redacted_response"
  | "browser_screenshot"
  | "runner_stdout"
  | "containment"
  | "oracle"
  | "code_reference";
