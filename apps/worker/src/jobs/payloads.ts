/**
 * Durable job payloads (pg-boss queue names + validated bodies).
 *
 * Queue names mirror the contract `JobTypeSchema` catalog
 * (docs/architecture/06_EVENTS_AND_JOBS.md). Every handler validates the
 * payload with Zod before acting — queue contents are not a trust boundary.
 */
import { z } from "zod";

export const JOB_NAMES = {
  planAndExecute: "scan.plan_and_execute",
  cancelAndCleanup: "scan.cancel_and_cleanup",
  finalize: "scan.finalize",
  replayExecute: "replay.execute",
  orphanReap: "sandbox.orphan_reap",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

const Uuid = z.string().uuid();

/** `scan.plan_and_execute` — one queued scan through the full pipeline. */
export const PlanAndExecutePayloadSchema = z.object({ workspaceId: Uuid, scanId: Uuid }).strict();
export type PlanAndExecutePayload = z.infer<typeof PlanAndExecutePayloadSchema>;

/** `scan.cancel_and_cleanup` — cooperative cancel + runner teardown. */
export const CancelPayloadSchema = z.object({ workspaceId: Uuid, scanId: Uuid }).strict();
export type CancelPayload = z.infer<typeof CancelPayloadSchema>;

/** `scan.finalize` — idempotent terminal aggregation for one scan. */
export const FinalizePayloadSchema = z.object({ workspaceId: Uuid, scanId: Uuid }).strict();
export type FinalizePayload = z.infer<typeof FinalizePayloadSchema>;

/** `replay.execute` — pinned pack against the patched environment. */
export const ReplayExecutePayloadSchema = z.object({ workspaceId: Uuid, replayId: Uuid }).strict();
export type ReplayExecutePayload = z.infer<typeof ReplayExecutePayloadSchema>;

/** `sandbox.orphan_reap` — periodic container/registry reconciliation. */
export const OrphanReapPayloadSchema = z.object({ workspaceId: Uuid.optional() }).strict();
export type OrphanReapPayload = z.infer<typeof OrphanReapPayloadSchema>;

export const JOB_PAYLOAD_SCHEMAS = {
  [JOB_NAMES.planAndExecute]: PlanAndExecutePayloadSchema,
  [JOB_NAMES.cancelAndCleanup]: CancelPayloadSchema,
  [JOB_NAMES.finalize]: FinalizePayloadSchema,
  [JOB_NAMES.replayExecute]: ReplayExecutePayloadSchema,
  [JOB_NAMES.orphanReap]: OrphanReapPayloadSchema,
} as const;

/** Validate a raw job body or return a bounded error string. */
export function parseJobPayload<T extends JobName>(
  name: T,
  payload: unknown,
): { ok: true; data: z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]> } | { ok: false; error: string } {
  const parsed = JOB_PAYLOAD_SCHEMAS[name].safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid payload" };
  }
  return { ok: true, data: parsed.data as z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]> };
}
