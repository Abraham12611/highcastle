/**
 * `sandbox.orphan_reap` — periodic reconciliation of runner rows against
 * actual containers (worker crash, leaked leases, forced kills).
 */
import type { OrchestratorDeps } from "./deps.js";

export interface OrphanReapResult {
  inspected: number;
  reaped: number;
  markedLost: number;
  errors: string[];
}

export async function executeOrphanReap(deps: OrchestratorDeps): Promise<OrphanReapResult> {
  const report = await deps.sandbox.reconcileOrphans(deps.clock.now());
  return {
    inspected: report.inspected,
    reaped: report.reaped.length,
    markedLost: report.markedLost.length,
    errors: report.errors,
  };
}
