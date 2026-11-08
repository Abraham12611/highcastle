/**
 * Durable scan-event emission. Events are the ONLY progress channel —
 * the UI renders persisted rows, never synthetic timers (spec 06).
 */
import type { ActorType, ScanEventType, ScanPhase } from "@highcastle/contracts";
import type { OrchestratorDeps } from "./deps.js";

export interface EmitInput {
  workspaceId: string;
  scanId: string;
  eventType: ScanEventType;
  phase?: ScanPhase | null;
  actorType: ActorType;
  safeSummary: string;
  payloadRedacted?: Record<string, unknown>;
  attemptId?: string | null;
}

export async function emit(deps: OrchestratorDeps, input: EmitInput) {
  return deps.events.publish({
    workspaceId: input.workspaceId,
    scanId: input.scanId,
    eventType: input.eventType,
    phase: input.phase ?? null,
    actorType: input.actorType,
    safeSummary: input.safeSummary.slice(0, 280),
    payloadRedacted: input.payloadRedacted,
    attemptId: input.attemptId ?? null,
  });
}
