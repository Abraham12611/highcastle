"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "../cx.js";
import { Icon } from "../icons.js";
import type { ActorType, ScanPhase, Tone } from "../tokens.js";
import { ActorBadge, PhaseBadge } from "./badge.js";

/**
 * Event timeline for the live-investigation surface. Renders REAL
 * persisted events only — never fabricate entries to fake progress.
 */

export type TimelineItemStatus = "done" | "active" | "pending" | "failed" | "blocked";

export interface TimelineEvent {
  id: string;
  /** Display sequence number (01, 02, ...); defaults to list order. */
  seq?: number;
  title: ReactNode;
  detail?: ReactNode;
  /** ISO 8601 timestamp; rendered verbatim (consumer formats). */
  timestamp?: string;
  phase?: ScanPhase;
  actor?: ActorType;
  status: TimelineItemStatus;
  /** Expandable content — the attempt drawer payload in compact form. */
  expanded?: ReactNode;
}

const NODE_TONE: Record<TimelineItemStatus, string> = {
  done: "done",
  active: "active",
  failed: "failed",
  blocked: "blocked",
  pending: "pending",
};

function TimelineNode({ event, index }: { event: TimelineEvent; index: number }) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const seq = event.seq ?? index + 1;

  return (
    <li
      className={cx("hc-timeline-item", `hc-timeline-item--${NODE_TONE[event.status]}`)}
      aria-current={event.status === "active" ? "step" : undefined}
    >
      <span className="hc-timeline-node" aria-hidden="true">
        {event.status === "done" ? (
          <Icon name="check" size={13} />
        ) : event.status === "failed" ? (
          <Icon name="x" size={13} />
        ) : event.status === "blocked" ? (
          <Icon name="shield-off" size={13} />
        ) : (
          String(seq).padStart(2, "0")
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="hc-timeline-head">
          <h4 className="hc-timeline-title">{event.title}</h4>
          {event.phase ? <PhaseBadge phase={event.phase} size="sm" /> : null}
          {event.actor ? <ActorBadge actor={event.actor} size="sm" /> : null}
          {event.timestamp ? (
            <time className="hc-timeline-meta" dateTime={event.timestamp}>
              {event.timestamp}
            </time>
          ) : null}
        </div>
        {event.detail ? <div className="hc-timeline-detail">{event.detail}</div> : null}
        {event.expanded ? (
          <>
            <button
              type="button"
              className="hc-timeline-toggle"
              aria-expanded={open}
              aria-controls={`${uid}-body`}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon name="chevron-right" size={12} />
              {open ? "Collapse" : "Expand"}
            </button>
            <div id={`${uid}-body`} className="hc-timeline-body" hidden={!open}>
              {event.expanded}
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Chronological event list connected by a thin line — original
 * geometry, not a copied bar array. Wrap live regions yourself:
 * the parent decides politeness based on event source.
 */
export function Timeline({
  events,
  className,
  "aria-label": ariaLabel = "Scan event timeline",
}: {
  events: TimelineEvent[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <ol className={cx("hc-timeline", className)} aria-label={ariaLabel}>
      {events.map((event, i) => (
        <TimelineNode key={event.id} event={event} index={i} />
      ))}
    </ol>
  );
}

/** Compact "currently running" line with terminal cursor. */
export function TimelineLiveIndicator({
  children,
  tone = "cyan",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <p
      className={cx("hc-mono", className)}
      style={{
        color: `var(--hc-${tone === "slate" ? "low" : tone})`,
        fontSize: "var(--hc-text-sm)",
        margin: 0,
      }}
      role="status"
    >
      {children}
      <span className="hc-cursor" aria-hidden="true" />
    </p>
  );
}
