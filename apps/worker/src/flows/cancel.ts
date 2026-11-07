/**
 * `scan.cancel_and_cleanup` — high-priority cooperative cancellation.
 *
 * Ordering: flag → abort in-flight runners → persist terminal `canceled`.
 * Cancellation works even when the originating browser is gone (spec:
 * emergency stop must work with the UI closed).
 */
import { isTerminalScanStatus } from "@highcastle/contracts";
import { ScanStateConflictError } from "../adapters/errors.js";
import type { OrchestratorDeps } from "./deps.js";
import { emit } from "./events.js";

export interface CancelJobPayload {
  workspaceId: string;
  scanId: string;
}

export interface CancelJobResult {
  status: "canceled" | "skipped" | "already_terminal";
}

export async function executeCancelJob(
  deps: OrchestratorDeps,
  payload: CancelJobPayload,
): Promise<CancelJobResult> {
  const { workspaceId, scanId } = payload;
  const scan = await deps.store.getScan(workspaceId, scanId);
  if (!scan) throw new Error(`scan ${scanId} not found in workspace`);
  if (isTerminalScanStatus(scan.status)) {
    return { status: "already_terminal" };
  }

  if (scan.cancelRequestedAt === null) {
    await deps.store.requestScanCancel(workspaceId, scanId);
    await emit(deps, {
      workspaceId,
      scanId,
      eventType: "scan.cancel_requested",
      phase: null,
      actorType: "worker",
      safeSummary: "cancel requested; stopping in-flight work",
    });
  }

  // In-process fast path + out-of-process runner teardown.
  deps.cancelRegistry.abort(scanId);
  for (const runnerId of await deps.store.listActiveRunnerIds(workspaceId, scanId)) {
    try {
      await deps.sandbox.cancel(runnerId, "scan_canceled");
    } catch {
      // Best-effort; reconcileOrphans is the backstop.
    }
  }

  try {
    await deps.store.transitionScan(workspaceId, scanId, { to: "canceled" });
  } catch (err) {
    if (!(err instanceof ScanStateConflictError)) throw err;
  }
  await emit(deps, {
    workspaceId,
    scanId,
    eventType: "scan.canceled",
    phase: null,
    actorType: "worker",
    safeSummary: "scan canceled; runner cleanup signaled",
  });
  deps.cancelRegistry.release(scanId);
  return { status: "canceled" };
}
