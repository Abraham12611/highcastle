"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "../cx.js";
import { Icon } from "../icons.js";

/**
 * Form primitives. `Field` wires label + hint + error to the control
 * via aria-describedby/aria-invalid; controls also work standalone.
 */

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Override the auto-generated id when wiring a custom control. */
  htmlFor?: string;
  className?: string;
}

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  htmlFor,
  className,
}: FieldProps) {
  const id = useId();
  const controlId = htmlFor ?? id;
  return (
    <div className={cx("hc-field", className)}>
      <label className="hc-label" htmlFor={controlId}>
        {label}
        {required ? (
          <span className="hc-label-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="hc-error-text" role="alert">
          <Icon name="alert-triangle" size={13} />
          {error}
        </p>
      ) : hint ? (
        <p className="hc-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  mono?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { error = false, mono = false, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cx("hc-input", error && "hc-input--error", mono && "hc-input--mono", className)}
      {...rest}
    />
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { error = false, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={error || undefined}
      className={cx("hc-textarea", error && "hc-textarea--error", className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error = false, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={error || undefined}
      className={cx("hc-select", error && "hc-select--error", className)}
      {...rest}
    >
      {children}
    </select>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: ReactNode;
}

/** Accessible labelled checkbox on a 24px+ touch row. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  return (
    <label className={cx("hc-checkbox-row", className)} htmlFor={id ?? autoId}>
      <input ref={ref} id={id ?? autoId} type="checkbox" className="hc-checkbox" {...rest} />
      <span>
        {label}
        {hint ? (
          <span className="hc-hint" style={{ display: "block" }}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
});
