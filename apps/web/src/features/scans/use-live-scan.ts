"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  // Key the history to the scan id; switching scans cannot leak the previous
  // scan's events, and no ref/state updates occur during render.
  const [eventState, setEventState] = useState<{scanId: string; frames: ScanEventFrame[]}>({
    scanId,
    frames: [],
  });
  const events = eventState.scanId === scanId ? eventState.frames : [];
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [terminalStatus, setTerminalStatus] = useState<ScanStatus | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const handle = connectScanStream({
      url: scanEventsUrl(scanId),
      ...(eventSourceFactory ? { eventSourceFactory } : {}),
      onFrame: (frame) => {
        setEventState((prev) => {
          const frames = prev.scanId === scanId ? prev.frames : [];
          // sorted insert handles out-of-order delivery and duplicate frames.
          if (frames.some((e) => e.seq === frame.seq)) return prev;
          const next = [...frames, frame];
          next.sort((a, b) => a.seq - b.seq);
          return { scanId, frames: next };
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
