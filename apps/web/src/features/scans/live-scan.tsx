"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScanStatus } from "@highcastle/contracts";
import { useLiveScan, type LiveScanDeps } from "./use-live-scan";
import {
  laneForEvent,
  PHASE_LABELS,
  PHASE_ORDER,
  type ScanEventFrame,
} from "./types";
import "./scans.css";

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  closed: "Stream closed",
  failed: "Stream failed",
};

function phaseIndex(phase: string | null): number {
  return phase === null ? -1 : PHASE_ORDER.indexOf(phase as never);
}

export function LiveScanView(props: LiveScanDeps & { scanId: string }) {
  const state = useLiveScan(props);
  const [selected, setSelected] = useState<ScanEventFrame | null>(null);
  const containment = useMemo(
    () => state.events.filter((e) => e.eventType === "sandbox.action_blocked"),
    [state.events],
  );
  const lastPhase = [...state.events].reverse().find((e) => e.phase)?.phase ?? null;
  const activeIdx = phaseIndex(lastPhase);
  const blockedFirst = containment[0];
  const findingEvent = state.events.find((e) => e.eventType === "finding.confirmed");

  return (
    <main className="scan-live" aria-live="polite">
      <header className="scan-live__header">
        <div>
          <h1>Live investigation</h1>
          <p className="scan-live__sub">
            Scan <code>{props.scanId.slice(0, 8)}…</code> · target-lab · bola-invoice-v1
          </p>
        </div>
        <div className={`scan-stream scan-stream--${state.streamStatus}`}>
          <span className="scan-stream__dot" aria-hidden />
          {STATUS_LABEL[state.streamStatus]}
        </div>
      </header>

      {/* Phase rail — driven only by observed events */}
      <ol className="phase-rail" aria-label="Scan phases">
        {PHASE_ORDER.map((p, i) => (
          <li
            key={p}
            className={`phase-rail__step ${
              i < activeIdx ? "is-done" : i === activeIdx ? "is-active" : ""
            }`}
          >
            {PHASE_LABELS[p]}
          </li>
        ))}
      </ol>

      {state.error !== null && (
        <div className="hc-callout hc-callout--danger" role="alert">
          {state.error.message} ({state.error.code})
          {state.streamStatus === "failed" && (
            <button type="button" onClick={state.reconnect}>Retry stream</button>
          )}
        </div>
      )}

      {blockedFirst && (
        <section className="blocked-banner" aria-label="Containment">
          <strong>Blocked operation observed.</strong> The sandbox denied an
          out-of-scope action — this is containment evidence, not a finding.
          <p>{blockedFirst.safeSummary}</p>
        </section>
      )}

      <div className="scan-live__grid">
        <section aria-label="Event timeline" className="timeline">
          <h2>Event timeline</h2>
          {state.events.length === 0 && (
            <p className="muted">Waiting for first server events…</p>
          )}
          <ol>
            {state.events.map((e) => (
              <li key={e.seq}>
                <button
                  type="button"
                  className={`tl-item tl-item--${laneForEvent(e.eventType)}`}
                  onClick={() => setSelected(e)}
                  aria-label={`Event ${e.seq} ${e.eventType}: ${e.safeSummary}`}
                >
                  <span className="tl-item__seq">#{e.seq}</span>
                  <span className="tl-item__type">{e.eventType}</span>
                  <span className="tl-item__summary">{e.safeSummary}</span>
                  <time dateTime={e.occurredAt}>
                    {new Date(e.occurredAt).toLocaleTimeString()}
                  </time>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <aside className="scan-live__side">
          <section aria-label="Containment ledger" className="ledger">
            <h2>Containment ledger</h2>
            {containment.length === 0 ? (
              <p className="muted">No blocked operations recorded.</p>
            ) : (
              <ol>
                {containment.map((e) => (
                  <li key={e.seq}>
                    <span className="ledger__rule">#{e.seq}</span>
                    <span>{e.safeSummary}</span>
                    <time dateTime={e.occurredAt}>
                      {new Date(e.occurredAt).toLocaleTimeString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-label="Actions" className="scan-actions">
            {!state.terminal && (
              <button
                type="button"
                className="hc-btn hc-btn--danger"
                disabled={state.cancelRequested}
                onClick={() => void state.requestCancel()}
              >
                {state.cancelRequested ? "Cancel requested…" : "Cancel scan"}
              </button>
            )}
            {state.terminal && (
              <div className={`scan-done scan-done--${state.terminalStatus ?? "completed"}`}>
                Scan {state.terminalStatus ?? "completed"}.
              </div>
            )}
            {state.terminal && (
              <Link
                className="hc-btn hc-btn--primary"
                href={`/app/findings${findingEvent?.findingId ? `/${findingEvent.findingId}` : ""}`}
              >
                View findings →
              </Link>
            )}
          </section>
        </aside>
      </div>

      {selected && (
        <div
          className="event-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Event ${selected.seq} details`}
        >
          <button type="button" className="event-drawer__close" onClick={() => setSelected(null)}>
            Close ✕
          </button>
          <h3>{selected.eventType}</h3>
          <dl>
            <dt>seq</dt><dd>{selected.seq}</dd>
            <dt>phase</dt><dd>{selected.phase ?? "—"}</dd>
            <dt>lane</dt><dd>{laneForEvent(selected.eventType)}</dd>
            <dt>occurredAt</dt><dd>{selected.occurredAt}</dd>
            {selected.attemptId && (<><dt>attemptId</dt><dd>{selected.attemptId}</dd></>)}
            {selected.findingId && (<><dt>findingId</dt><dd>{selected.findingId}</dd></>)}
            <dt>summary</dt><dd>{selected.safeSummary}</dd>
          </dl>
        </div>
      )}
    </main>
  );
}

export type { ScanStatus };
