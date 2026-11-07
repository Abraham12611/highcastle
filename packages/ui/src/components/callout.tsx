import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon, type IconName } from "../icons.js";

export type CalloutTone = "info" | "success" | "warning" | "danger" | "policy";

const CALLOUT_ICON: Record<CalloutTone, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  danger: "alert-octagon",
  policy: "shield-off",
};

/**
 * Inline notice for scope, limitation and policy messaging. `policy`
 * tone is violet and reserved for execution-boundary explanations.
 */
export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("hc-callout", `hc-callout--${tone}`, className)}>
      <Icon name={CALLOUT_ICON[tone]} size={16} />
      <div>
        {title ? <p className="hc-callout-title">{title}</p> : null}
        {children ? <div className="hc-callout-body">{children}</div> : null}
      </div>
    </div>
  );
}
