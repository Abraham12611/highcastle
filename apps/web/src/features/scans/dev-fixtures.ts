import type { ScanEventFrame } from "./types";
import type { AssessmentContext } from "./api";

/**
 * DEV-ONLY story fixtures for the mocked component path
 * (`/app/scans/story`). These are NEVER imported by the live wizard or live
 * screen — the deployed route renders real server events only. Keeping the
 * fixture here proves the component rendering path without fabricating
 * runtime behavior.
 */

export const STORY_ASSESSMENT: AssessmentContext = {
  project: { id: "22222222-2222-4222-8222-222222222222", name: "Invoice Lab", slug: "invoice-demo" },
  targets: [
    {
      target: {
        id: "33333333-3333-4333-8333-333333333333",
        label: "Synthetic invoice lab",
        canonicalOrigin: "https://target-lab.internal",
        targetKind: "demo",
        state: "verified",
      },
      environment: {
        id: "44444444-4444-4444-8444-444444444444",
        label: "Attack twin",
        currentRevision: "lab-v1-vulnerable",
      },
      scope: {
        id: "66666666-6666-4666-8666-666666666666",
        allowedTestPackIds: ["bola-invoice-v1"],
        allowedMethods: ["GET"],
        allowedPaths: ["/api/invoices"],
        expiresAt: "2026-11-06T13:00:00.000Z",
        maxRequests: 16,
        maxDurationSeconds: 60,
      },
    },
  ],
};

export const STORY_EVENTS: ScanEventFrame[] = [
  { eventType: "scan.requested", scanId: "s", seq: 1, phase: "preparing", safeSummary: "Scan queued for invoice lab attack twin", attemptId: null, occurredAt: "2026-11-06T12:00:00Z" },
  { eventType: "scan.started", scanId: "s", seq: 2, phase: "preparing", safeSummary: "Worker claimed scan job", attemptId: null, occurredAt: "2026-11-06T12:00:01Z" },
  { eventType: "scan.stage.updated", scanId: "s", seq: 3, phase: "recon", safeSummary: "Preflight: lab revision lab-v1-vulnerable, fixture 1.0.0", attemptId: null, occurredAt: "2026-11-06T12:00:02Z" },
  { eventType: "test.plan.validated", scanId: "s", seq: 4, phase: "planning", safeSummary: "Vultr model proposed bola-invoice-v1; policy allowed", attemptId: null, occurredAt: "2026-11-06T12:00:05Z" },
  { eventType: "sandbox.action_blocked", scanId: "s", seq: 5, phase: "executing", safeSummary: "Egress to out-of-scope host denied by network policy", attemptId: "77777777-7777-4777-8777-777777777777", occurredAt: "2026-11-06T12:00:07Z" },
  { eventType: "test.executed", scanId: "s", seq: 6, phase: "executing", safeSummary: "Pack completed 6 requests in 4.2s", attemptId: "77777777-7777-4777-8777-777777777777", occurredAt: "2026-11-06T12:00:09Z" },
  { eventType: "finding.confirmed", scanId: "s", seq: 7, phase: "verifying", safeSummary: "Oracle reproduced cross-account invoice read", attemptId: "77777777-7777-4777-8777-777777777777", occurredAt: "2026-11-06T12:00:10Z", findingId: "88888888-8888-4888-8888-888888888888" },
  { eventType: "scan.completed", scanId: "s", seq: 8, phase: "finalizing", safeSummary: "Scan completed — runner destroyed, cleanup verified", attemptId: null, occurredAt: "2026-11-06T12:00:12Z" },
];
