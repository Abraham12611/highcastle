"use client";

import { STORY_ASSESSMENT, STORY_EVENTS } from "../../../../features/scans/dev-fixtures";
import { ScanWizard } from "../../../../features/scans/wizard";
import { LiveScanView } from "../../../../features/scans/live-scan";
import type { EventSourceLike } from "../../../../features/scans/sse-client";

/**
 * DEV-ONLY mocked story — renders components against fixtures so the UI can
 * be reviewed without a backend. The deployed live routes never import the
 * fixture path.
 */
export default function ScanStoryPage() {
  const fakeFactory = (url: string): EventSourceLike => {
    const listeners = new Map<string, Array<(e: { data: string; lastEventId: string | null }) => void>>();
    const src: EventSourceLike = {
      readyState: 1,
      close() {},
      onerror: null,
      addEventListener(t, l) {
        listeners.set(t, [...(listeners.get(t) ?? []), l]);
      },
    };
    queueMicrotask(() => {
      for (const f of STORY_EVENTS) {
        for (const l of listeners.get(f.eventType) ?? []) {
          l({ data: JSON.stringify(f), lastEventId: String(f.seq) });
        }
      }
    });
    void url;
    return src;
  };
  return (
    <div>
      <ScanWizard
        projectId="invoice-demo"
        contextOverride={STORY_ASSESSMENT}
        createScanFn={async () => ({
          ok: true as const,
          data: {
            scanId: "99999999-9999-4999-8999-999999999999" as never,
            status: "queued" as const,
            eventsUrl: "/api/v1/scans/99999999-9999-4999-8999-999999999999/stream",
            scopeHash: "0".repeat(64),
            targetRevision: "lab-v1-vulnerable",
          },
        })}
      />
      <hr />
      <LiveScanView
        scanId="99999999-9999-4999-8999-999999999999"
        eventSourceFactory={fakeFactory}
      />
    </div>
  );
}
