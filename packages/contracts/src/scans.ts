import { z } from "zod";
import {
  ActorTypeSchema,
  ScanEventTypeSchema,
  ScanPhaseSchema,
  ScanStatusSchema,
  TestPackIdSchema,
  TestPackMethodSchema,
  isTerminalScanStatus,
} from "./enums.js";
import {
  AttemptIdSchema,
  AuthorizationScopeIdSchema,
  EnvironmentIdSchema,
  ProjectIdSchema,
  ScanEventIdSchema,
  ScanIdSchema,
  TargetIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import {
  CursorPaginationQuerySchema,
  IdempotencyKeySchema,
  IsoUtcDateTimeSchema,
  SafeSummarySchema,
  ScopeHashSchema,
  SemVerSchema,
} from "./common.js";
import { CONTRACT_SCHEMA_VERSION } from "./version.js";

/**
 * Scan requests, execution state, durable events and summaries.
 * Consumed by L16 (orchestrator), L17 (events/SSE), L18 (BFF), L09 (live UI).
 */

// --- Create scan (POST /api/v1/projects/:pid/scans) ---
//
// NOTE: there is deliberately no `targetUrl`, `hosts`, `command` or
// `toolArgs` field. The scan names an already-authorized target + scope by ID
// and enumerated pack IDs; L13/L04 resolve and intersect them server-side.

export const CreateScanRequestSchema = z
  .object({
    type: z
      .enum(["targeted_red_team", "baseline_check", "replay_verification"])
      .default("targeted_red_team"),
    environmentId: EnvironmentIdSchema,
    targetId: TargetIdSchema,
    authorizationScopeId: AuthorizationScopeIdSchema,
    testPackIds: z.array(TestPackIdSchema).min(1).max(8),
    sourceRevision: z.string().min(1).max(128).optional(),
    maxDurationSeconds: z.number().int().min(1).max(600).optional(),
  })
  .strict();
export type CreateScanRequest = z.infer<typeof CreateScanRequestSchema>;

export const CreateScanResponseSchema = z
  .object({
    scanId: ScanIdSchema,
    status: z.literal("queued"),
    eventsUrl: z.string().min(1).max(512),
    scopeHash: ScopeHashSchema,
    targetRevision: z.string().min(1).max(128),
  })
  .strict();
export type CreateScanResponse = z.infer<typeof CreateScanResponseSchema>;

// --- Scan entity (L02 row shape) ---

export const ScanSchema = z
  .object({
    id: ScanIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    scopeId: AuthorizationScopeIdSchema,
    sourceSnapshotRef: z.string().min(1).max(128).nullable(),
    targetId: TargetIdSchema,
    environmentId: EnvironmentIdSchema,
    targetRevision: z.string().min(1).max(128),
    fixtureVersion: SemVerSchema.nullable(),
    scanType: z.enum([
      "targeted_red_team",
      "baseline_check",
      "replay_verification",
    ]),
    testPackIds: z.array(TestPackIdSchema).min(1),
    testPackVersions: z.record(SemVerSchema).optional(),
    requestedByUserId: UserIdSchema,
    idempotencyKey: IdempotencyKeySchema.nullable(),
    status: ScanStatusSchema,
    phase: ScanPhaseSchema.nullable(),
    planVersion: z.number().int().min(1).nullable(),
    plannedCount: z.number().int().min(0),
    executedCount: z.number().int().min(0),
    confirmedCount: z.number().int().min(0),
    startedAt: IsoUtcDateTimeSchema.nullable(),
    endedAt: IsoUtcDateTimeSchema.nullable(),
    cancelRequestedAt: IsoUtcDateTimeSchema.nullable(),
    failureCode: z.string().min(1).max(128).nullable(),
    publicDemo: z.boolean(),
    createdAt: IsoUtcDateTimeSchema,
    updatedAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type Scan = z.infer<typeof ScanSchema>;

// --- Durable scan events (persisted, then streamed over SSE) ---

const ScanEventBaseSchema = z
  .object({
    id: ScanEventIdSchema,
    workspaceId: WorkspaceIdSchema,
    scanId: ScanIdSchema,
    /** Monotonic per scan; unique(scan_id, seq) in L02. */
    seq: z.number().int().min(1),
    schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
    eventType: ScanEventTypeSchema,
    phase: ScanPhaseSchema.nullable(),
    actorType: ActorTypeSchema,
    safeSummary: SafeSummarySchema,
    /** Redacted structured payload; never raw secrets or chain-of-thought. */
    payloadRedacted: z.record(z.unknown()).optional(),
    attemptId: AttemptIdSchema.nullable(),
    occurredAt: IsoUtcDateTimeSchema,
  })
  .strict();

/** `test.executed` always references the attempt that ran. */
const TestExecutedEventSchema = ScanEventBaseSchema.extend({
  eventType: z.literal("test.executed"),
  attemptId: AttemptIdSchema,
});

/** `finding.confirmed` always references the finding that was upserted. */
const FindingConfirmedEventSchema = ScanEventBaseSchema.extend({
  eventType: z.literal("finding.confirmed"),
  payloadRedacted: z
    .record(z.unknown())
    .and(z.object({ findingId: z.string().uuid() })),
});

export const ScanEventSchema = z
  .union([
    TestExecutedEventSchema,
    FindingConfirmedEventSchema,
    ScanEventBaseSchema,
  ])
  .superRefine((event, ctx) => {
    // The union falls through to the base variant, so re-assert the
    // per-type requirements here: they are load-bearing for L17 replay.
    if (event.eventType === "test.executed" && event.attemptId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "test.executed requires attemptId",
      });
    }
    if (
      event.eventType === "finding.confirmed" &&
      (event.payloadRedacted == null ||
        typeof event.payloadRedacted !== "object" ||
        !("findingId" in event.payloadRedacted))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "finding.confirmed requires payloadRedacted.findingId",
      });
    }
  });
export type ScanEvent = z.infer<typeof ScanEventSchema>;

/** Events are appended with strictly increasing seq per scan. */
export function isNextEventSeq(existing: readonly number[], next: number): boolean {
  const max = existing.length === 0 ? 0 : Math.max(...existing);
  return next === max + 1;
}

// --- Summaries (GET /scans/:sid, /attempts) ---

export const ScanSummarySchema = z
  .object({
    scanId: ScanIdSchema,
    status: ScanStatusSchema,
    terminal: z.boolean(),
    phase: ScanPhaseSchema.nullable(),
    plannedCount: z.number().int().min(0),
    executedCount: z.number().int().min(0),
    confirmedCount: z.number().int().min(0),
    coverage: z.object({
      packIds: z.array(TestPackIdSchema),
      packVersions: z.record(SemVerSchema),
      oracleVersion: z.string().min(1).max(64),
    }),
    versions: z.object({
      contractSchemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
      scopeHash: ScopeHashSchema,
      targetRevision: z.string().min(1).max(128),
      fixtureVersion: SemVerSchema.nullable(),
    }),
  })
  .strict();
export type ScanSummary = z.infer<typeof ScanSummarySchema>;

export function toScanSummary(
  scan: Scan,
  extra: { oracleVersion: string; scopeHash: z.infer<typeof ScopeHashSchema> },
): ScanSummary {
  return {
    scanId: scan.id,
    status: scan.status,
    terminal: isTerminalScanStatus(scan.status),
    phase: scan.phase,
    plannedCount: scan.plannedCount,
    executedCount: scan.executedCount,
    confirmedCount: scan.confirmedCount,
    coverage: {
      packIds: scan.testPackIds,
      packVersions: scan.testPackVersions ?? {},
      oracleVersion: extra.oracleVersion,
    },
    versions: {
      contractSchemaVersion: CONTRACT_SCHEMA_VERSION,
      scopeHash: extra.scopeHash,
      targetRevision: scan.targetRevision,
      fixtureVersion: scan.fixtureVersion,
    },
  };
}

export const AttemptSummarySchema = z
  .object({
    attemptId: AttemptIdSchema,
    packId: TestPackIdSchema,
    packVersion: SemVerSchema,
    status: z.enum([
      "proposed",
      "validated",
      "blocked",
      "queued",
      "running",
      "completed",
      "timeout",
      "failed",
      "canceled",
    ]),
    verdict: z.enum(["reproduced", "not_reproduced", "inconclusive"]).nullable(),
    positiveControlPassed: z.boolean().nullable(),
    negativeSecurityConditionMet: z.boolean().nullable(),
    permittedMethods: z.array(TestPackMethodSchema),
    startedAt: IsoUtcDateTimeSchema.nullable(),
    endedAt: IsoUtcDateTimeSchema.nullable(),
  })
  .strict();
export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;

// --- List / history queries ---

export const ScanHistoryQuerySchema = CursorPaginationQuerySchema.extend({
  status: ScanStatusSchema.optional(),
}).strict();
export type ScanHistoryQuery = z.infer<typeof ScanHistoryQuerySchema>;

export const ScanEventsQuerySchema = z
  .object({
    after: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type ScanEventsQuery = z.infer<typeof ScanEventsQuerySchema>;

/** SSE `Last-Event-ID` / `after` cursor must be a non-negative seq. */
export const ScanEventCursorSchema = z.coerce.number().int().min(0);
export type ScanEventCursor = z.infer<typeof ScanEventCursorSchema>;

// --- Cancel / retry ---

export const CancelScanRequestSchema = z.object({}).strict();
export type CancelScanRequest = z.infer<typeof CancelScanRequestSchema>;

export const RetryScanRequestSchema = z
  .object({
    authorizationScopeId: AuthorizationScopeIdSchema.optional(),
  })
  .strict();
export type RetryScanRequest = z.infer<typeof RetryScanRequestSchema>;
