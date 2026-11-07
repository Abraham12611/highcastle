import { cx } from "../cx.js";
import { Icon } from "../icons.js";
import { CopyButton } from "./copy-button.js";

/**
 * Source snapshot reference — short commit SHA + copy of the full
 * revision. Provenance for "what code did we actually test".
 */
export function SnapshotPill({
  revision,
  label = "rev",
  className,
}: {
  /** Full revision string; the first 10 chars are displayed. */
  revision: string;
  label?: string;
  className?: string;
}) {
  const short = revision.slice(0, 10);
  return (
    <span className={cx("hc-snapshot", className)} title={revision}>
      <Icon name="code" size={12} />
      <span>
        {label} {short}
        {revision.length > 10 ? "…" : ""}
      </span>
      <CopyButton value={revision} label="Copy revision" />
    </span>
  );
}
