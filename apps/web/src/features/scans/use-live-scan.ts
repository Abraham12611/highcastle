"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScanStatus } from "@highcastle/contracts";
import {
  connectScanStream,
  type EventSourceLike,
  type StreamStatus,
} from "./sse-client";
import type { ScanEventFrame } from "./types";
import { isTerminalEvent } from "./types";
import { cancelScan, scanEventsUrl, type ApiFailure } from "./api";

export interface LiveScanState {
  events: ScanEventFrame[];
  streamStatus: StreamStatus;
  cancelRequested: boolean;
  terminal: boolean;
  terminalStatus: ScanStatus | null;
  error: ApiFailure | null;
  reconnect: () => void;
  requestCancel: () => Promise<void>;
}

/** EventSource factory injection seam for tests. */
export type LiveScanDeps = {
  eventSourceFactory?: (url: string) => EventSourceLike;
  scanId: string;
};

export function useLiveScan({
  scanId,
  eventSourceFactory,
}: LiveScanDeps): LiveScanState {
  const [events, setEvents] = useState<ScanEventFrame[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [terminalStatus, setTerminalStatus] = useState<ScanStatus | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [nonce, setNonce] = useState(0);
  const seqSet = useRef(new Set<number>());
  const [activeScanId, setActiveScanId] = useState(scanId);
  if (activeScanId !== scanId) {
    setActiveScanId(scanId);
    setEvents([]);
    seqSet.current = new Set();
  }

  useEffect(() => {
    seqSet.current = new Set();
    const handle = connectScanStream({
      url: scanEventsUrl(scanId),
      ...(eventSourceFactory ? { eventSourceFactory } : {}),
      onFrame: (frame) => {
        seqSet.current.add(frame.seq);
        setEvents((prev) => {
          // sorted insert handles out-of-order delivery; dedupe is
          // guaranteed upstream but kept defensive here.
          if (prev.some((e) => e.seq === frame.seq)) return prev;
          const next = [...prev, frame];
          next.sort((a, b) => a.seq - b.seq);
          return next;
        });
      },
      onStatus: (s) => setStreamStatus(s),
      onTerminal: (frame) => {
        setTerminalStatus(
          frame.eventType === "scan.failed"
            ? "failed"
            : frame.eventType === "scan.canceled"
              ? "canceled"
              : "completed",
        );
      },
      onFailed: (reason) =>
        setError({ code: "stream_failed", message: reason, status: 0 }),
    });
    return () => handle.close();
  }, [scanId, nonce, eventSourceFactory]);

  const terminal = useMemo(
    () => terminalStatus !== null || events.some((e) => isTerminalEvent(e.eventType)),
    [events, terminalStatus],
  );

  const reconnect = useCallback(() => {
    setError(null);
    setStreamStatus("connecting");
    setNonce((n) => n + 1);
  }, []);

  const requestCancel = useCallback(async () => {
    setCancelRequested(true);
    const res = await cancelScan(scanId);
    if (!res.ok) {
      setCancelRequested(false);
      setError(res.error);
    }
  }, [scanId]);

  return {
    events,
    streamStatus,
    cancelRequested,
    terminal,
    terminalStatus,
    error,
    reconnect,
    requestCancel,
  };
}
