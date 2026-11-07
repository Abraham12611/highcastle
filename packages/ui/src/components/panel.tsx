import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx.js";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Elevated surface-2 with drop shadow (modals use their own styles). */
  elevated?: boolean;
  /** Hover affordance for clickable rows/cards. */
  interactive?: boolean;
}

export function Panel({ elevated = false, interactive = false, className, ...rest }: PanelProps) {
  return (
    <div
      className={cx(
        "hc-panel",
        elevated && "hc-panel--elevated",
        interactive && "hc-panel--interactive",
        className,
      )}
      {...rest}
    />
  );
}

export function PanelHeader({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("hc-panel-header", className)}>
      {title ? <h3 className="hc-panel-title">{title}</h3> : children}
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}

export function PanelBody({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("hc-panel-body", className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelFooter({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("hc-panel-footer", className)} {...rest}>
      {children}
    </div>
  );
}
