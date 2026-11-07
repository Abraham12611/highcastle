"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon, type IconName } from "../icons.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading decorative icon. */
  icon?: IconName;
  /** Show a spinner, label the control busy, and block repeat presses. */
  loading?: boolean;
}

/**
 * HighCastle button. Primary carries the pixel offset shadow and ink
 * text — reserve it for the single strongest action per surface.
 * `type` defaults to "button" so it never submits a form by accident.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    icon,
    loading = false,
    disabled,
    type = "button",
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "hc-btn",
        `hc-btn--${variant}`,
        size !== "md" && `hc-btn--${size}`,
        loading && "hc-btn--loading",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="hc-spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 14 : 16} />
      ) : null}
      <span className="hc-btn-label">{children}</span>
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required accessible name (there is no visible label). */
  label: string;
  size?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 16, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx("hc-icon-btn", className)}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
});

/** Horizontal action row with consistent gap (e.g. modal-free footers). */
export function ButtonRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("hc-state-actions", className)}>{children}</div>;
}
