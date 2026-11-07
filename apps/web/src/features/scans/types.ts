import type {
  ScanEventType,
  ScanPhase,
  ScanStatus,
} from "@highcastle/contracts";
import {
  SCAN_TERMINAL_STATUSES,
  ScanEventTypeSchema,
  ScanPhaseSchema,
} from "@highcastle/contracts";

/**
 * The exact browser-safe frame L17 emits over SSE
 * (`apps/web/src/app/api/v1/scans/[scanId]/stream/handler.ts`):
 *   `id: <seq>`  `event: <eventType>`  `data: <frame JSON>`
 * Nothing else — no payloads, no secrets, no model text.
 */
export interface ScanEventFrame {
  eventType: ScanEventType;
  scanId: string;
  seq: number;
  phase: ScanPhase | null;
  safeSummary: string;
  attemptId: string | null;
  occurredAt: string;
  findingId?: string;
}

export function parseFrame(
  eventType: string,
  raw: string,
): ScanEventFrame | null {
  const et = ScanEventTypeSchema.safeParse(eventType);
  if (!et.success) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const phase = ScanPhaseSchema.nullable().safeParse(data.phase ?? null);
    const seq = data.seq;
    if (
      typeof seq !== "number" ||
      !Number.isInteger(seq) ||
      seq < 1 ||
      typeof data.safeSummary !== "string" ||
      typeof data.occurredAt !== "string" ||
      typeof data.scanId !== "string" ||
      !phase.success
    ) {
      return null;
    }
    const frame: ScanEventFrame = {
      eventType: et.data,
      scanId: data.scanId,
      seq,
      phase: phase.data,
      safeSummary: data.safeSummary.slice(0, 280),
      attemptId: typeof data.attemptId === "string" ? data.attemptId : null,
      occurredAt: data.occurredAt,
    };
    if (typeof data.findingId === "string") frame.findingId = data.findingId;
    return frame;
  } catch {
    return null;
  }
}

/** Phase ordering for the progress rail (actual, not simulated). */
export const PHASE_ORDER: readonly ScanPhase[] = [
  "preparing",
  "recon",
  "planning",
  "executing",
  "verifying",
  "finalizing",
];

export const PHASE_LABELS: Record<ScanPhase, string> = {
  preparing: "Preparing",
  recon: "Recon",
  planning: "Model planning",
  executing: "Execution",
  verifying: "Oracle verify",
  finalizing: "Finalizing",
};

/** Event → visual lane grouping for the investigation timeline. */
export type EventLane =
  | "lifecycle"
  | "model"
  | "policy"
  | "sandbox"
  | "oracle"
  | "containment"
  | "cleanup"
  | "finding";

export function laneForEvent(t: ScanEventType): EventLane {
  switch (t) {
    case "test.plan.validated":
    case "test.approval_required":
      return "model";
    case "test.executed":
      return "sandbox";
    case "sandbox.action_blocked":
      return "containment";
    case "finding.confirmed":
      return "finding";
    case "scan.cancel_requested":
    case "scan.canceled":
    case "scan.started":
    case "scan.stage.updated":
    case "scan.completed":
    case "scan.failed":
      return "lifecycle";
    default:
      return "lifecycle";
  }
}

/** Event types that make the scan terminal (from contract, not invented). */
const TERMINAL_EVENTS = new Set<ScanEventType>([
  "scan.completed",
  "scan.failed",
  "scan.canceled",
]);

export function isTerminalEvent(t: ScanEventType): boolean {
  return TERMINAL_EVENTS.has(t);
}

export function isTerminalStatus(s: ScanStatus): boolean {
  return (SCAN_TERMINAL_STATUSES as readonly string[]).includes(s);
}
