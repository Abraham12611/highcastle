import type { ReactNode } from "react";
import { cx } from "../cx.js";

/**
 * Page/status header: title + status/meta cluster + right actions.
 * Consumers compose badges in `meta` and buttons in `actions`
 * (e.g. elapsed time, cancel action on a live scan).
 */
export function StatusHeader({
  title,
  meta,
  badges,
  actions,
  className,
}: {
  title: ReactNode;
  /** Mono secondary facts: scan id, elapsed, target, revision. */
  meta?: ReactNode;
  /** Status badges rendered next to the title. */
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("hc-status-header", className)}>
      <div className="hc-status-header-titles">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 className="hc-status-header-title">{title}</h1>
          {badges}
        </div>
        {meta ? <div className="hc-status-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="hc-status-header-actions">{actions}</div> : null}
    </div>
  );
}
