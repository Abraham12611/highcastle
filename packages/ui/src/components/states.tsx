"use client";

import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon, type IconName } from "../icons.js";
import { WatchtowerArt } from "./diagrams.js";

/**
 * Result states. Copy stays honest: an inconclusive or untested check
 * is never presented as "safe", and blocked scope is explicit.
 */

interface StateShellProps {
  icon?: IconName | undefined;
  art?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string | undefined;
}

function StateShell({ icon, art, title, children, actions, className }: StateShellProps) {
  return (
    <div className={cx("hc-state", className)}>
      {art ? (
        <div className="hc-state-art" aria-hidden="true">
          {art}
        </div>
      ) : icon ? (
        <span className="hc-state-art" aria-hidden="true">
          <Icon name={icon} size={36} />
        </span>
      ) : null}
      <h3 className="hc-state-title">{title}</h3>
      {children ? <p className="hc-state-body">{children}</p> : null}
      {actions ? <div className="hc-state-actions">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  actions,
  art,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Custom artwork; defaults to the original watchtower beacon. */
  art?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      title={title}
      actions={actions}
      className={className}
      art={art === undefined ? <WatchtowerArt width={160} /> : art}
    >
      {children}
    </StateShell>
  );
}

export function ErrorState({
  title = "Something failed",
  children,
  diagnostic,
  actions,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  /** Diagnostic/reference id from the API — helps support correlate. */
  diagnostic?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell icon="alert-octagon" title={title} actions={actions} className={className}>
      {children}
      {diagnostic ? <span className="hc-state-diagnostic">ref: {diagnostic}</span> : null}
    </StateShell>
  );
}

export function LoadingState({
  label = "Loading",
  lines = 3,
  className,
}: {
  label?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cx("hc-state", className)} role="status" aria-label={label}>
      <span
        className="hc-spinner"
        style={{ width: 24, height: 24, color: "var(--hc-primary)" }}
        aria-hidden="true"
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "min(320px, 80%)",
          alignItems: "center",
        }}
      >
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} width={`${100 - i * 14}%`} />
        ))}
      </div>
      <span className="hc-state-body" style={{ margin: 0 }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Deliberate non-result: the evidence was insufficient to decide.
 * Distinct styling from success AND from failure.
 */
export function InconclusiveState({
  title = "Inconclusive",
  children = "We couldn't establish the outcome from the available evidence.",
  actions,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell icon="help-circle" title={title} actions={actions} className={className}>
      {children}
    </StateShell>
  );
}

/** Policy/scope denial — the boundary stopped an action. */
export function BlockedState({
  title = "Blocked by scope",
  children = "This operation was rejected by the execution boundary.",
  reference,
  actions,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  reference?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell icon="shield-off" title={title} actions={actions} className={className}>
      {children}
      {reference ? <span className="hc-state-diagnostic">policy ref: {reference}</span> : null}
    </StateShell>
  );
}

export function Skeleton({
  width = "100%",
  height = "0.9em",
  className,
  style,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cx("hc-skeleton", className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function Spinner({
  size = 16,
  label,
  className,
}: {
  size?: number;
  /** Accessible name; omit when decorative next to text. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cx("hc-spinner", className)}
      style={{ width: size, height: size }}
      {...(label
        ? { role: "status" as const, "aria-label": label }
        : { "aria-hidden": true as const })}
    />
  );
}
