import type { ReactNode } from "react";
import { Icon } from "../icons.js";
import { StatusPill } from "./badge.js";
import { Panel, PanelBody, PanelHeader } from "./panel.js";

/**
 * Recorded authorization scope — the exact target, permitted packs,
 * test identities and limits a run was approved against. This is a
 * display of a server-side record, not an interactive grant.
 */

export interface ScopeEntry {
  label: string;
  value: ReactNode;
}

export function ScopePanel({
  title = "Authorized scope",
  status = "active",
  entries,
  footer,
  className,
}: {
  title?: ReactNode;
  status?: "active" | "revoked" | "expired";
  entries: ScopeEntry[];
  footer?: ReactNode;
  className?: string;
}) {
  const statusMeta = {
    active: { tone: "mint" as const, icon: "shield-check" as const, label: "Scope active" },
    revoked: { tone: "coral" as const, icon: "shield-off" as const, label: "Scope revoked" },
    expired: { tone: "slate" as const, icon: "clock" as const, label: "Scope expired" },
  }[status];

  return (
    <Panel className={className}>
      <PanelHeader
        title={title}
        actions={
          <StatusPill
            tone={statusMeta.tone}
            icon={statusMeta.icon}
            size="sm"
            label={statusMeta.label}
          />
        }
      />
      <PanelBody>
        <dl className="hc-scope-list">
          {entries.map((entry, i) => (
            <div key={i} style={{ display: "contents" }}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
        {footer ? (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 8,
              alignItems: "center",
              color: "var(--hc-muted)",
              fontSize: "var(--hc-text-xs)",
            }}
          >
            <Icon name="lock" size={13} />
            {footer}
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
