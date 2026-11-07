"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "../cx.js";
import { Icon } from "../icons.js";

/**
 * Copy-to-clipboard control with transient "Copied" confirmation
 * announced via an aria-live region. Falls back to execCommand for
 * non-secure contexts (e.g. plain-HTTP dev targets).
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        /* clipboard unavailable — the button still reports its attempt */
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      className={cx("hc-icon-btn hc-code-copy", className)}
      onClick={copy}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      style={{ width: 28, height: 28 }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      <span className="hc-visually-hidden" aria-live="polite">
        {copied ? `${copiedLabel} to clipboard` : ""}
      </span>
    </button>
  );
}
