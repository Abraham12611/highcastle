import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons.js";
import type { Tone } from "../tokens.js";
import { Panel, PanelBody, PanelHeader } from "./panel.js";

/**
 * Containment ledger — the live sandbox boundary record: egress,
 * mounts, secrets, resource caps and the last block event. Rows are
 * real recorded entries, never a decorative checklist.
 */

export type LedgerRowStatus = "enforced" | "blocked" | "clear" | "unknown";

const LEDGER_META: Record<LedgerRowStatus, { icon: IconName; tone: Tone; label: string }> = {
  enforced: { icon: "shield-check", tone: "mint", label: "Enforced" },
  blocked: { icon: "shield-off", tone: "coral", label: "Blocked" },
  clear: { icon: "check", tone: "slate", label: "None recorded" },
  unknown: { icon: "help-circle", tone: "slate", label: "Not reported" },
};

export interface LedgerEntry {
  key: string;
  label: ReactNode;
  /** Right-side recorded value, e.g. "restricted" or "0 events". */
  value?: ReactNode;
  status: LedgerRowStatus;
  detail?: ReactNode;
}

export function ContainmentLedger({
  entries,
  title = "Containment ledger",
  className,
}: {
  entries: LedgerEntry[];
  title?: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <PanelHeader title={title} />
      <PanelBody style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.length === 0 ? (
          <p style={{ margin: 0, color: "var(--hc-subtle)", fontSize: "var(--hc-text-sm)" }}>
            No containment events recorded.
          </p>
        ) : (
          entries.map((entry) => {
            const meta = LEDGER_META[entry.status];
            return (
              <div
                key={entry.key}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  fontSize: "var(--hc-text-sm)",
                }}
              >
                <span
                  style={{
                    color: `var(--hc-${meta.tone === "slate" ? "low" : meta.tone})`,
                    flex: "none",
                    position: "relative",
                    top: 2,
                  }}
                >
                  <Icon name={meta.icon} size={14} />
                </span>
                <span style={{ color: "var(--hc-text)" }}>{entry.label}</span>
                <span
                  className="hc-mono"
                  style={{
                    marginLeft: "auto",
                    color: "var(--hc-muted)",
                    fontSize: "var(--hc-text-xs)",
                    textAlign: "right",
                  }}
                >
                  {entry.value ?? meta.label}
                </span>
                {entry.detail ? <span className="hc-state-diagnostic">{entry.detail}</span> : null}
              </div>
            );
          })
        )}
      </PanelBody>
    </Panel>
  );
}
