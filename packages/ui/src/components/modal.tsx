"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "../cx.js";
import { FOCUSABLE_SELECTOR, nextTrapIndex } from "../focus.js";
import { Icon } from "../icons.js";

/**
 * Overlay primitives: Modal + Drawer + ConfirmModal.
 *
 * - focus trap + initial focus + focus restore
 * - ESC closes unless `requireExplicitAction` (safety-sensitive
 *   confirmations like scope approval must be decided, not dismissed)
 * - overlay click never closes — modals here carry explicit decisions
 * - body scroll locked while open
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Disable ESC + require a deliberate footer action. */
  requireExplicitAction?: boolean;
  /** Hide the X button (defaults on for requireExplicitAction). */
  hideClose?: boolean;
  className?: string;
}

function useOverlayBehavior(
  open: boolean,
  onClose: () => void,
  requireExplicitAction: boolean,
  containerRef: RefObject<HTMLElement | null>,
) {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    const initial = container?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0];
    initial?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !requireExplicitAction) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = nextTrapIndex(current, items.length, event.shiftKey ? -1 : 1);
      if (next >= 0) {
        event.preventDefault();
        items[next]?.focus();
      } else {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose, requireExplicitAction, containerRef]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  requireExplicitAction = false,
  hideClose,
  className,
}: ModalProps) {
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  useOverlayBehavior(open, onClose, requireExplicitAction, ref);
  if (!open || typeof document === "undefined") return null;

  const showClose = !(hideClose ?? requireExplicitAction);

  return createPortal(
    <div className="hc-overlay">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={description ? `${uid}-desc` : undefined}
        className={cx("hc-modal", size !== "md" && `hc-modal--${size}`, className)}
      >
        <div className="hc-modal-header">
          <div>
            <h2 className="hc-modal-title" id={`${uid}-title`}>
              {title}
            </h2>
            {description ? (
              <p className="hc-modal-description" id={`${uid}-desc`}>
                {description}
              </p>
            ) : null}
          </div>
          {showClose ? (
            <button
              type="button"
              className="hc-icon-btn hc-modal-close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <Icon name="x" size={16} />
            </button>
          ) : null}
        </div>
        {children ? <div className="hc-modal-body">{children}</div> : null}
        {footer ? <div className="hc-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  useOverlayBehavior(open, onClose, false, ref);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="hc-overlay hc-overlay--drawer">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className={cx("hc-drawer", className)}
      >
        <div className="hc-modal-header">
          <h2 className="hc-modal-title" id={`${uid}-title`}>
            {title}
          </h2>
          <button
            type="button"
            className="hc-icon-btn hc-modal-close"
            onClick={onClose}
            aria-label="Close panel"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="hc-modal-body" style={{ flex: 1 }}>
          {children}
        </div>
        {footer ? <div className="hc-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Deliberate yes/no decision (cancel scan, accept scope, retry).
 * The confirm button is explicit about consequence; ESC still works
 * unless `requireExplicitAction` is set.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requireExplicitAction = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  destructive?: boolean;
  requireExplicitAction?: boolean;
  children?: ReactNode;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
      size="sm"
      requireExplicitAction={requireExplicitAction}
      footer={
        <>
          <CancelButton onClose={onClose}>{cancelLabel}</CancelButton>
          <button
            ref={confirmRef}
            type="button"
            data-autofocus
            className={cx("hc-btn", destructive ? "hc-btn--destructive" : "hc-btn--primary")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

function CancelButton({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <button type="button" className="hc-btn hc-btn--ghost" onClick={onClose}>
      {children}
    </button>
  );
}
