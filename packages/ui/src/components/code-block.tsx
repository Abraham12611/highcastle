import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { CopyButton } from "./copy-button.js";

/**
 * Code / evidence display. Horizontal overflow scrolls inside the
 * component — never pushes the page — and the scroll region itself
 * is keyboard-focusable per WCAG 2.1.1.
 */
export function CodeBlock({
  code,
  language,
  title,
  lineNumbers = false,
  copyable = true,
  actions,
  className,
  "aria-label": ariaLabel,
}: {
  /** Raw text to display; pass pre-highlighted spans via `children`? No — keep it escaped text. */
  code: string;
  language?: string;
  title?: ReactNode;
  lineNumbers?: boolean;
  copyable?: boolean;
  actions?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <figure
      className={cx("hc-code", lineNumbers && "hc-code--numbered", className)}
      style={{ margin: 0 }}
    >
      {language || title || copyable || actions ? (
        <figcaption className="hc-code-header">
          {language ? <span className="hc-code-lang">{language}</span> : null}
          {title ? <span className="hc-code-title">{title}</span> : null}
          {actions}
          {copyable ? <CopyButton value={code} label="Copy code" className="hc-code-copy" /> : null}
        </figcaption>
      ) : null}
      <div
        className="hc-code-scroll"
        tabIndex={0}
        role="region"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : "Code block")}
      >
        <pre className="hc-code-pre">
          <code>
            {lineNumbers
              ? lines.map((line, i) => (
                  <span key={i} className="hc-code-line">
                    {line || " "}
                  </span>
                ))
              : code}
          </code>
        </pre>
      </div>
    </figure>
  );
}
