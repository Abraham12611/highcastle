/**
 * Job registration: map each durable queue name to its flow handler.
 *
 * Handlers validate payloads with Zod (queue contents are untrusted),
 * classify failures for pg-boss retry semantics, and NEVER catch-and-hide:
 * an unexpected error bubbles so pg-boss can retry bounded times, then
 * dead-letter for an operator.
 */
import type { Job, PgBoss } from "pg-boss";
import type { OrchestratorDeps } from "../flows/deps.js";
import { executeScanJob } from "../flows/scan.js";
import { executeCancelJob } from "../flows/cancel.js";
import { executeReplayJob } from "../flows/replay.js";
import { executeOrphanReap } from "../flows/janitor.js";
import {
  CancelPayloadSchema,
  FinalizePayloadSchema,
  JOB_NAMES,
  PlanAndExecutePayloadSchema,
  ReplayExecutePayloadSchema,
} from "./payloads.js";

function payloadOf(job: Job<unknown> | undefined): unknown {
  return job?.data ?? job;
}

/**
 * `scan.finalize` — idempotent terminal aggregation. The scan flow
 * finalizes inline today; this entrypoint exists so an operator/API can
 * re-drive finalization for a scan stranded mid-flight (e.g. after a
 * deploy between `verifying` and `finalizing`). It re-enters the same
 * resumable state machine rather than duplicating finalize logic.
 */
async function handleFinalize(deps: OrchestratorDeps, raw: Job<unknown> | undefined) {
  const parsed = FinalizePayloadSchema.safeParse(payloadOf(raw));
  if (!parsed.success) {
    throw new Error(`invalid ${JOB_NAMES.finalize} payload: ${parsed.error.message}`);
  }
  return executeScanJob(deps, parsed.data);
}

/**
 * Register all flow handlers on a started boss instance.
 * Returns the work() registration IDs for clean shutdown.
 */
export async function registerHandlers(boss: PgBoss, deps: OrchestratorDeps): Promise<string[]> {
  const ids: string[] = [];

  ids.push(
    await boss.work(JOB_NAMES.planAndExecute, { batchSize: 1 }, async (jobs: Job<unknown>[]) => {
      const parsed = PlanAndExecutePayloadSchema.safeParse(payloadOf(jobs[0]));
      if (!parsed.success) {
        throw new Error(`invalid ${JOB_NAMES.planAndExecute} payload: ${parsed.error.message}`);
      }
      return executeScanJob(deps, parsed.data);
    }),
  );

  ids.push(
    await boss.work(JOB_NAMES.cancelAndCleanup, { batchSize: 4 }, async (jobs: Job<unknown>[]) => {
      const parsed = CancelPayloadSchema.safeParse(payloadOf(jobs[0]));
      if (!parsed.success) {
        throw new Error(`invalid ${JOB_NAMES.cancelAndCleanup} payload: ${parsed.error.message}`);
      }
      return executeCancelJob(deps, parsed.data);
    }),
  );

  ids.push(
    await boss.work(JOB_NAMES.finalize, { batchSize: 1 }, async (jobs: Job<unknown>[]) => {
      return handleFinalize(deps, jobs[0]);
    }),
  );

  ids.push(
    await boss.work(JOB_NAMES.replayExecute, { batchSize: 1 }, async (jobs: Job<unknown>[]) => {
      const parsed = ReplayExecutePayloadSchema.safeParse(payloadOf(jobs[0]));
      if (!parsed.success) {
        throw new Error(`invalid ${JOB_NAMES.replayExecute} payload: ${parsed.error.message}`);
      }
      return executeReplayJob(deps, parsed.data);
    }),
  );

  ids.push(
    await boss.work(JOB_NAMES.orphanReap, { batchSize: 1 }, async () => {
      return executeOrphanReap(deps);
    }),
  );

  return ids;
}
