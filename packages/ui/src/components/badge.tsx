import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon, type IconName } from "../icons.js";
import type {
  ActorType,
  AssertionOutcome,
  AttemptStatus,
  Confidence,
  OracleVerdict,
  RemediationStatus,
  ReplayVerdict,
  ScanPhase,
  ScanStatus,
  Severity,
  Tone,
} from "../tokens.js";

/**
 * Status chips. Severity, confidence and remediation are independent
 * axes and render as separate badges — never merged, never color-only.
 */

export interface StatusPillProps {
  tone?: Tone | undefined;
  icon?: IconName | undefined;
  /** Show a pulsing square dot for live/running states. */
  live?: boolean | undefined;
  /** Notched leading corner — the HighCastle chip silhouette. */
  notched?: boolean | undefined;
  size?: "sm" | "md" | undefined;
  label?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

export function StatusPill({
  tone = "slate",
  icon,
  live = false,
  notched = false,
  size = "md",
  label,
  className,
  children,
}: StatusPillProps) {
  return (
    <span
      className={cx(
        "hc-pill",
        `hc-pill--${tone}`,
        notched && "hc-pill--notched",
        size === "sm" && "hc-pill--sm",
        className,
      )}
    >
      {live ? (
        <span className="hc-pulse-dot hc-pulse-dot--live" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 12 : 13} />
      ) : null}
      <span>{children ?? label}</span>
    </span>
  );
}

/* ---------- severity (risk impact axis) ---------- */

const SEVERITY_META: Record<Severity, { tone: Tone; icon: IconName; label: string; bars: number }> =
  {
    critical: { tone: "coral", icon: "alert-octagon", label: "Critical", bars: 4 },
    high: { tone: "orange", icon: "alert-triangle", label: "High", bars: 3 },
    medium: { tone: "amber", icon: "dot-circle", label: "Medium", bars: 2 },
    low: { tone: "slate", icon: "info", label: "Low", bars: 1 },
    informational: {
      tone: "slate",
      icon: "info",
      label: "Informational",
      bars: 0,
    },
  };

export function SeverityBadge({
  severity,
  size,
  className,
}: {
  severity: Severity;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = SEVERITY_META[severity];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}

/**
 * Stepped signal-bar meter + text label. The bars rise like rampart
 * steps — an original motif, not a copied bar array.
 */
export function SeverityMeter({
  severity,
  showLabel = true,
  className,
}: {
  severity: Severity;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={cx("hc-meter", className)}
      style={{ color: `var(--hc-${meta.tone === "slate" ? "low" : meta.tone})` }}
      role="img"
      aria-label={`Severity: ${meta.label}`}
    >
      <span className="hc-meter-bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx("hc-meter-bar", i < meta.bars && "hc-meter-bar--lit")} />
        ))}
      </span>
      {showLabel ? (
        <span className="hc-meter-label">{meta.label}</span>
      ) : (
        <span className="hc-visually-hidden">{meta.label}</span>
      )}
    </span>
  );
}

/* ---------- confidence (evidentiary strength axis) ---------- */

const CONFIDENCE_META: Record<Confidence, { tone: Tone; icon: IconName; label: string }> = {
  suspected: { tone: "violet", icon: "spark", label: "Suspected" },
  supported_by_analysis: {
    tone: "violet",
    icon: "search",
    label: "Supported by analysis",
  },
  confirmed_by_execution: {
    tone: "cyan",
    icon: "terminal",
    label: "Confirmed by execution",
  },
  not_reproduced: {
    tone: "slate",
    icon: "x-circle",
    label: "Not reproduced",
  },
  inconclusive: { tone: "slate", icon: "help-circle", label: "Inconclusive" },
};

export function ConfidenceBadge({
  confidence,
  size,
  className,
}: {
  confidence: Confidence;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = CONFIDENCE_META[confidence];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}

/* ---------- remediation (workflow axis) ---------- */

const REMEDIATION_META: Record<RemediationStatus, { tone: Tone; icon: IconName; label: string }> = {
  open: { tone: "coral", icon: "dot-circle", label: "Open" },
  in_progress: { tone: "cyan", icon: "progress", label: "In progress" },
  pending_verification: {
    tone: "amber",
    icon: "clock",
    label: "Pending verification",
  },
  verified_fixed: {
    tone: "success",
    icon: "shield-check",
    label: "Verified fixed",
  },
  accepted_risk: { tone: "amber", icon: "flag", label: "Accepted risk" },
  dismissed: { tone: "slate", icon: "x", label: "Dismissed" },
  reopened: { tone: "orange", icon: "refresh", label: "Reopened" },
};

export function RemediationBadge({
  status,
  size,
  className,
}: {
  status: RemediationStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = REMEDIATION_META[status];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}

/* ---------- verdicts (oracle + replay) ---------- */

const VERDICT_META: Record<
  OracleVerdict | ReplayVerdict,
  { tone: Tone; icon: IconName; label: string }
> = {
  reproduced: { tone: "coral", icon: "alert-octagon", label: "Reproduced" },
  not_reproduced: {
    tone: "success",
    icon: "check-circle",
    label: "Not reproduced",
  },
  inconclusive: { tone: "slate", icon: "help-circle", label: "Inconclusive" },
  verified_fixed: {
    tone: "success",
    icon: "shield-check",
    label: "Verified fixed",
  },
  still_vulnerable: {
    tone: "coral",
    icon: "alert-triangle",
    label: "Still vulnerable",
  },
  regression: { tone: "orange", icon: "alert-octagon", label: "Regression" },
};

export function VerdictBadge({
  verdict,
  size,
  className,
}: {
  verdict: OracleVerdict | ReplayVerdict;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}

/* ---------- scan lifecycle ---------- */

const SCAN_STATUS_META: Record<
  ScanStatus,
  { tone: Tone; icon: IconName; label: string; live: boolean }
> = {
  draft: { tone: "slate", icon: "file", label: "Draft", live: false },
  preflight: { tone: "slate", icon: "search", label: "Preflight", live: true },
  awaiting_approval: {
    tone: "amber",
    icon: "clock",
    label: "Awaiting approval",
    live: false,
  },
  queued: { tone: "slate", icon: "clock", label: "Queued", live: false },
  preparing: { tone: "cyan", icon: "box", label: "Preparing", live: true },
  recon: { tone: "cyan", icon: "beacon", label: "Recon", live: true },
  planning: { tone: "violet", icon: "chip", label: "Planning", live: true },
  executing: { tone: "cyan", icon: "terminal", label: "Executing", live: true },
  verifying: { tone: "cyan", icon: "eye", label: "Verifying", live: true },
  finalizing: { tone: "cyan", icon: "flag", label: "Finalizing", live: true },
  completed: {
    tone: "success",
    icon: "check-circle",
    label: "Completed",
    live: false,
  },
  partial: { tone: "amber", icon: "progress", label: "Partial", live: false },
  failed: { tone: "coral", icon: "x-circle", label: "Failed", live: false },
  canceled: { tone: "slate", icon: "ban", label: "Canceled", live: false },
};

export function ScanStatusBadge({
  status,
  size,
  className,
}: {
  status: ScanStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = SCAN_STATUS_META[status];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      live={meta.live}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}

const PHASE_META: Record<ScanPhase, { tone: Tone; icon: IconName }> = {
  preparing: { tone: "cyan", icon: "box" },
  recon: { tone: "cyan", icon: "beacon" },
  planning: { tone: "violet", icon: "chip" },
  executing: { tone: "cyan", icon: "terminal" },
  verifying: { tone: "cyan", icon: "eye" },
  finalizing: { tone: "cyan", icon: "flag" },
};

const PHASE_LABELS: Record<ScanPhase, string> = {
  preparing: "Preparing",
  recon: "Recon",
  planning: "Planning",
  executing: "Executing",
  verifying: "Verifying",
  finalizing: "Finalizing",
};

export function PhaseBadge({
  phase,
  size,
  className,
}: {
  phase: ScanPhase;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = PHASE_META[phase];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      size={size ?? "md"}
      className={className}
      label={PHASE_LABELS[phase]}
    />
  );
}

/* ---------- actors (who produced the event) ---------- */

const ACTOR_META: Record<ActorType, { tone: Tone; icon: IconName; label: string }> = {
  user: { tone: "slate", icon: "user", label: "User" },
  model: { tone: "violet", icon: "chip", label: "Model" },
  worker: { tone: "cyan", icon: "settings", label: "Worker" },
  policy: { tone: "amber", icon: "shield-off", label: "Policy" },
  runner: { tone: "cyan", icon: "box", label: "Runner" },
  oracle: { tone: "success", icon: "eye", label: "Oracle" },
  operator: { tone: "slate", icon: "settings", label: "Operator" },
  system: { tone: "slate", icon: "server", label: "System" },
};

/**
 * The hypothesis/execution/verdict distinction is a core honesty rule:
 * model events render violet, executed output cyan, verifier mint.
 */
export function ActorBadge({
  actor,
  size,
  className,
}: {
  actor: ActorType;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = ACTOR_META[actor];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}

/* ---------- attempt status ---------- */

const ATTEMPT_META: Record<
  AttemptStatus,
  { tone: Tone; icon: IconName; label: string; live: boolean }
> = {
  proposed: { tone: "violet", icon: "spark", label: "Proposed", live: false },
  validated: { tone: "violet", icon: "check", label: "Validated", live: false },
  blocked: { tone: "orange", icon: "shield-off", label: "Blocked", live: false },
  queued: { tone: "slate", icon: "clock", label: "Queued", live: false },
  running: { tone: "cyan", icon: "terminal", label: "Running", live: true },
  completed: {
    tone: "success",
    icon: "check-circle",
    label: "Completed",
    live: false,
  },
  timeout: { tone: "amber", icon: "clock", label: "Timed out", live: false },
  failed: { tone: "coral", icon: "x-circle", label: "Failed", live: false },
  canceled: { tone: "slate", icon: "ban", label: "Canceled", live: false },
};

export function AttemptStatusBadge({
  status,
  size,
  className,
}: {
  status: AttemptStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = ATTEMPT_META[status];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      live={meta.live}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}

/* ---------- assertions ---------- */

const ASSERTION_META: Record<
  AssertionOutcome | "denied" | "allowed",
  { tone: Tone; icon: IconName; label: string }
> = {
  pass: { tone: "success", icon: "check", label: "Pass" },
  fail: { tone: "coral", icon: "x", label: "Fail" },
  unknown: { tone: "slate", icon: "help-circle", label: "Unknown" },
  denied: { tone: "orange", icon: "ban", label: "Denied" },
  allowed: { tone: "success", icon: "check", label: "Allowed" },
};

export function AssertionChip({
  outcome,
  size,
  className,
}: {
  outcome: AssertionOutcome | "denied" | "allowed";
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = ASSERTION_META[outcome];
  return (
    <StatusPill
      tone={meta.tone}
      icon={meta.icon}
      size={size ?? "md"}
      className={className}
      label={meta.label}
    />
  );
}
