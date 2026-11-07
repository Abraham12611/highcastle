import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon, type IconName } from "../icons.js";
import { AssertionChip } from "./badge.js";
import { Panel, PanelBody } from "./panel.js";

/**
 * Before/after replay comparison — the product's signature proof.
 * Negative assertion (attack no longer reproduces) and positive
 * assertion (legitimate access still works) are shown side by side
 * with their actual observed outcomes.
 */

export type AssertionResult = "pass" | "fail" | "denied" | "allowed" | "unknown";

const ASSERTION_ICON: Record<AssertionResult, IconName> = {
  pass: "check",
  fail: "x",
  denied: "ban",
  allowed: "check",
  unknown: "help-circle",
};

const ASSERTION_CLASS: Record<AssertionResult, string> = {
  pass: "hc-assertion--pass",
  fail: "hc-assertion--fail",
  denied: "hc-assertion--denied",
  allowed: "hc-assertion--pass",
  unknown: "hc-assertion--unknown",
};

export interface AssertionRow {
  key: string;
  /** e.g. "Alice → Bob private invoice". */
  label: ReactNode;
  result: AssertionResult;
  /** Observed outcome text, e.g. "HTTP 200 with invoice body". */
  observed?: ReactNode;
}

function AssertionList({ rows }: { rows: AssertionRow[] }) {
  return (
    <ul className="hc-assertion-list">
      {rows.map((row) => (
        <li key={row.key} className={cx("hc-assertion", ASSERTION_CLASS[row.result])}>
          <Icon name={ASSERTION_ICON[row.result]} size={14} />
          <span className="hc-assertion-label">{row.label}</span>
          {row.observed ? (
            <span className="hc-assertion-outcome">{row.observed}</span>
          ) : (
            <AssertionChip outcome={row.result} size="sm" />
          )}
        </li>
      ))}
    </ul>
  );
}

export interface ReplaySide {
  /** e.g. "Before · lab-v1 (vulnerable)". */
  label: ReactNode;
  environment?: ReactNode;
  assertions: AssertionRow[];
  /** Link to that run's proof trace. */
  traceAction?: ReactNode;
  summary?: ReactNode;
}

export function ReplayDiff({
  before,
  after,
  verdict,
  className,
}: {
  before: ReplaySide;
  after: ReplaySide;
  /** Optional verdict banner under the panels. */
  verdict?: ReactNode;
  className?: string;
}) {
  const renderSide = (side: ReplaySide, variant: "before" | "after") => (
    <div className={cx(`hc-diff--${variant}`)}>
      <h4 className="hc-diff-panel-label">
        <Icon name={variant === "before" ? "alert-triangle" : "shield-check"} size={14} />
        {side.label}
        {side.environment ? (
          <span
            className="hc-mono"
            style={{ color: "var(--hc-subtle)", textTransform: "none", letterSpacing: 0 }}
          >
            {side.environment}
          </span>
        ) : null}
      </h4>
      <Panel>
        <PanelBody>
          <AssertionList rows={side.assertions} />
          {side.summary ? (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: "var(--hc-text-sm)",
                color: "var(--hc-muted)",
              }}
            >
              {side.summary}
            </p>
          ) : null}
          {side.traceAction ? <div style={{ marginTop: 12 }}>{side.traceAction}</div> : null}
        </PanelBody>
      </Panel>
    </div>
  );

  return (
    <div className={className}>
      <div className="hc-diff">
        {renderSide(before, "before")}
        {renderSide(after, "after")}
      </div>
      {verdict ? <div style={{ marginTop: 16 }}>{verdict}</div> : null}
    </div>
  );
}
