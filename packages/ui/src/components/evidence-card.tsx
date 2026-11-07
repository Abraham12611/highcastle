import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon, type IconName } from "../icons.js";
import type { EvidenceKind } from "../tokens.js";
import { StatusPill } from "./badge.js";
import { CopyButton } from "./copy-button.js";
import { Panel } from "./panel.js";

/**
 * Immutable evidence artifact card. Shows artifact kind, integrity
 * hash, redaction state and provenance (attempt + oracle) — the
 * "here is the actual evidence" contract of the product.
 */

const KIND_META: Record<EvidenceKind, { icon: IconName; label: string }> = {
  redacted_request: { icon: "arrow-up-right", label: "Request (redacted)" },
  redacted_response: { icon: "arrow-down-left", label: "Response (redacted)" },
  browser_screenshot: { icon: "image", label: "Screenshot" },
  runner_stdout: { icon: "terminal", label: "Runner output" },
  containment: { icon: "layers", label: "Containment record" },
  oracle: { icon: "eye", label: "Oracle report" },
  code_reference: { icon: "code", label: "Code reference" },
};

export interface EvidenceCardProps {
  kind: EvidenceKind;
  title: ReactNode;
  /** Integrity digest — shown truncated with a copy of the full value. */
  hash?: string;
  /** e.g. "attempt at_01J…" or "scan sc_01J…" provenance reference. */
  attemptRef?: string;
  redacted?: boolean;
  /** Preview/download affordances supplied by the consumer. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function EvidenceCard({
  kind,
  title,
  hash,
  attemptRef,
  redacted = true,
  actions,
  children,
  className,
}: EvidenceCardProps) {
  const meta = KIND_META[kind];
  return (
    <Panel className={cx("hc-evidence", className)}>
      <div className="hc-evidence-head">
        <span className="hc-evidence-kind">
          <Icon name={meta.icon} size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h4 className="hc-evidence-title">{title}</h4>
          <div className="hc-evidence-sub">
            {meta.label}
            {attemptRef ? ` · ${attemptRef}` : ""}
          </div>
        </div>
        {redacted ? <StatusPill tone="violet" icon="lock" size="sm" label="Redacted" /> : null}
        {actions ? <div className="hc-evidence-actions">{actions}</div> : null}
      </div>
      {hash ? (
        <div className="hc-evidence-hash">
          <Icon name="lock" size={12} />
          <code title={hash}>{hash}</code>
          <CopyButton value={hash} label="Copy digest" />
        </div>
      ) : null}
      {children}
    </Panel>
  );
}
