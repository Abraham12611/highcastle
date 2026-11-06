import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { Database, DbExecutor } from "../client.js";
import { authorizationScopes, scanEvents, scans, isTerminalScanStatus } from "../schema/tables.js";
import { DbError } from "../errors.js";

/** Allowed scan lifecycle transitions (spec § Scan lifecycle). */
const SCAN_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["preflight", "canceled"],
  preflight: ["awaiting_approval", "queued", "canceled"],
  awaiting_approval: ["queued", "canceled"],
  queued: ["preparing", "canceled"],
  preparing: ["recon", "failed", "canceled"],
  recon: ["planning", "failed", "canceled"],
  planning: ["executing", "verifying", "failed", "canceled"],
  executing: ["verifying", "failed", "canceled"],
  verifying: ["planning", "finalizing", "completed", "partial", "failed", "canceled"],
  finalizing: ["completed", "partial", "failed", "canceled"],
  completed: [],
  partial: [],
  failed: [],
  canceled: [],
};

export function isAllowedScanTransition(from: string, to: string): boolean {
  return SCAN_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface CreateScanInput {
  workspaceId: string;
  projectId: string;
  scopeId: string;
  sourceSnapshotRef?: string | null;
  targetId: string;
  environmentId?: string | null;
  targetRevision: string;
  fixtureVersion?: string | null;
  scanType?: "targeted_red_team" | "baseline_check" | "replay_verification";
  testPackIds: string[];
  testPackVersions?: Record<string, string>;
  requestedByUserId: string;
  idempotencyKey?: string | null;
  publicDemo?: boolean;
}

/**
 * Create a scan after verifying the authorization snapshot: the scope must
 * exist in this workspace, be `active`, be unexpired, and reference the same
 * project/target. Idempotent when `idempotencyKey` is set — a replayed
 * request returns the original scan row instead of inserting a duplicate.
 */
export async function createScan(db: Database, input: CreateScanInput) {
  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx
        .select()
        .from(scans)
        .where(
          and(
            eq(scans.workspaceId, input.workspaceId),
            eq(scans.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];
    }

    const [scope] = await tx
      .select()
      .from(authorizationScopes)
      .where(
        and(
          eq(authorizationScopes.id, input.scopeId),
          eq(authorizationScopes.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!scope) throw DbError.notFound("authorization_scope", input.scopeId);
    if (scope.status !== "active") {
      throw new DbError("scope_denied", `authorization scope is ${scope.status}`, {
        scopeId: input.scopeId,
      });
    }
    if (scope.expiresAt.getTime() <= Date.now()) {
      throw new DbError("scope_denied", "authorization scope has expired", {
        scopeId: input.scopeId,
      });
    }
    if (scope.projectId !== input.projectId || scope.targetId !== input.targetId) {
      throw new DbError("scope_denied", "scope does not authorize this project/target", {
        scopeId: input.scopeId,
      });
    }

    const [row] = await tx
      .insert(scans)
      .values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        scopeId: input.scopeId,
        sourceSnapshotRef: input.sourceSnapshotRef ?? null,
        targetId: input.targetId,
        environmentId: input.environmentId ?? null,
        targetRevision: input.targetRevision,
        fixtureVersion: input.fixtureVersion ?? null,
        scanType: input.scanType ?? "targeted_red_team",
        testPackIds: input.testPackIds,
        testPackVersions: input.testPackVersions ?? {},
        requestedByUserId: input.requestedByUserId,
        idempotencyKey: input.idempotencyKey ?? null,
        status: "queued",
        publicDemo: input.publicDemo ?? false,
      })
      .returning();
    if (!row) throw new DbError("internal", "scan insert returned no row");
    return row;
  });
}

/** Tenant-scoped read. */
export async function getScan(db: DbExecutor, workspaceId: string, scanId: string) {
  const rows = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, scanId), eq(scans.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface ListScansOptions {
  projectId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

/** Cursor = ISO timestamp of the last row's `created_at` (descending). */
export async function listScans(
  db: DbExecutor,
  workspaceId: string,
  options: ListScansOptions = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const conditions = [eq(scans.workspaceId, workspaceId)];
  if (options.projectId) conditions.push(eq(scans.projectId, options.projectId));
  if (options.cursor) {
    conditions.push(lt(scans.createdAt, new Date(options.cursor)));
  }
  return db
    .select()
    .from(scans)
    .where(and(...conditions))
    .orderBy(desc(scans.createdAt))
    .limit(limit + 1);
}

export interface ScanTransition {
  to:
    | "draft"
    | "preflight"
    | "awaiting_approval"
    | "queued"
    | "preparing"
    | "recon"
    | "planning"
    | "executing"
    | "verifying"
    | "finalizing"
    | "completed"
    | "partial"
    | "failed"
    | "canceled";
  phase?: "preparing" | "recon" | "planning" | "executing" | "verifying" | "finalizing" | null;
  planVersion?: number | null;
  plannedCount?: number;
  executedCount?: number;
  confirmedCount?: number;
  failureCode?: string | null;
}

/**
 * Move a scan along the lifecycle. Illegal transitions throw `conflict`;
 * terminal scans reject every transition. `startedAt`/`endedAt` are derived
 * here, never supplied by callers.
 */
export async function transitionScan(
  db: DbExecutor,
  workspaceId: string,
  scanId: string,
  transition: ScanTransition,
) {
  const existing = await getScan(db, workspaceId, scanId);
  if (!existing) throw DbError.notFound("scan", scanId);
  if (isTerminalScanStatus(existing.status)) {
    throw DbError.conflict(`scan is already terminal (${existing.status})`, {
      scanId,
    });
  }
  if (!isAllowedScanTransition(existing.status, transition.to)) {
    throw DbError.conflict(`illegal scan transition ${existing.status} -> ${transition.to}`, {
      scanId,
    });
  }
  const now = new Date();
  const patch: Partial<typeof scans.$inferInsert> = {
    status: transition.to,
    updatedAt: now,
  };
  if (transition.phase !== undefined) patch.phase = transition.phase;
  if (transition.planVersion !== undefined) patch.planVersion = transition.planVersion;
  if (transition.plannedCount !== undefined) patch.plannedCount = transition.plannedCount;
  if (transition.executedCount !== undefined) patch.executedCount = transition.executedCount;
  if (transition.confirmedCount !== undefined) patch.confirmedCount = transition.confirmedCount;
  if (transition.failureCode !== undefined) patch.failureCode = transition.failureCode;
  if (existing.startedAt === null && transition.to !== "queued") {
    patch.startedAt = now;
  }
  if (isTerminalScanStatus(transition.to)) patch.endedAt = now;
  const [row] = await db
    .update(scans)
    .set(patch)
    .where(
      and(
        eq(scans.id, scanId),
        eq(scans.workspaceId, workspaceId),
        eq(scans.status, existing.status),
      ),
    )
    .returning();
  if (!row) {
    throw DbError.conflict("scan was modified concurrently", { scanId });
  }
  return row;
}

/**
 * Flag a scan for cancellation. The worker observes the flag, terminates
 * the runner, then moves the scan to `canceled` via `transitionScan`
 * (which records the terminal `scan.canceled` event in the same tx).
 */
export async function requestScanCancel(db: DbExecutor, workspaceId: string, scanId: string) {
  const existing = await getScan(db, workspaceId, scanId);
  if (!existing) throw DbError.notFound("scan", scanId);
  if (isTerminalScanStatus(existing.status)) {
    throw DbError.conflict(`scan is already terminal (${existing.status})`, {
      scanId,
    });
  }
  const [row] = await db
    .update(scans)
    .set({ cancelRequestedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(scans.id, scanId), eq(scans.workspaceId, workspaceId)))
    .returning();
  if (!row) throw DbError.notFound("scan", scanId);
  return row;
}

// --- Durable scan events ---

export interface AppendEventInput {
  workspaceId: string;
  scanId: string;
  eventType:
    | "workspace.created"
    | "project.created"
    | "source.connected"
    | "target.verified"
    | "scope.approved"
    | "scan.requested"
    | "scan.started"
    | "scan.stage.updated"
    | "scan.cancel_requested"
    | "scan.canceled"
    | "test.approval_required"
    | "test.plan.validated"
    | "test.executed"
    | "sandbox.action_blocked"
    | "finding.confirmed"
    | "scan.completed"
    | "scan.failed"
    | "remediation.created"
    | "replay.completed"
    | "finding.verified_fixed"
    | "github.pr.updated"
    | "schedule.due"
    | "integration.revoked"
    | "workspace.emergency_stopped";
  phase?: "preparing" | "recon" | "planning" | "executing" | "verifying" | "finalizing" | null;
  actorType: "user" | "model" | "worker" | "policy" | "runner" | "oracle" | "operator" | "system";
  safeSummary: string;
  payloadRedacted?: Record<string, unknown>;
  attemptId?: string | null;
}

const MAX_SEQ_RETRIES = 8;

/**
 * Append a durable event with the next monotonic `seq` for the scan.
 * Concurrent writers serialize on the scan row (`FOR UPDATE`) and retry on
 * unique-violation, so parallel `appendScanEvent` calls always produce a
 * gapless 1..N sequence — never duplicates, never lost writes.
 */
export async function appendScanEvent(db: Database, input: AppendEventInput) {
  if (!input.safeSummary || input.safeSummary.length > 280) {
    throw new DbError("validation_error", "safeSummary must be 1..280 chars");
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const scan = await tx
          .select({ id: scans.id, workspaceId: scans.workspaceId })
          .from(scans)
          .where(and(eq(scans.id, input.scanId), eq(scans.workspaceId, input.workspaceId)))
          .limit(1)
          .for("update");
        if (!scan[0]) throw DbError.notFound("scan", input.scanId);
        const [maxRow = { max: null }] = await tx
          .select({ max: sql<number | string | null>`max(${scanEvents.seq})` })
          .from(scanEvents)
          .where(eq(scanEvents.scanId, input.scanId));
        // node-postgres returns int8 aggregates as strings while PGlite
        // returns numbers — coerce before incrementing, or `max + 1`
        // silently becomes string concatenation ("1" + 1 = "11").
        const maxRaw = maxRow.max;
        const max =
          typeof maxRaw === "string" ? Number.parseInt(maxRaw, 10) : (maxRaw ?? 0);
        const [row] = await tx
          .insert(scanEvents)
          .values({
            workspaceId: input.workspaceId,
            scanId: input.scanId,
            seq: (max ?? 0) + 1,
            eventType: input.eventType,
            phase: input.phase ?? null,
            actorType: input.actorType,
            safeSummary: input.safeSummary,
            payloadRedacted: input.payloadRedacted ?? {},
            attemptId: input.attemptId ?? null,
          })
          .returning();
        if (!row) throw new DbError("internal", "event insert returned no row");
        return row;
      });
    } catch (error) {
      lastError = error;
      if (error instanceof DbError) throw error;
      if (!isUniqueViolation(error) || attempt === MAX_SEQ_RETRIES - 1) throw error;
    }
  }
  throw lastError;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

export interface ListEventsOptions {
  afterSeq?: number;
  limit?: number;
}

/** Ordered event history for SSE rehydrate (`afterSeq` = Last-Event-ID). */
export async function listScanEvents(
  db: DbExecutor,
  workspaceId: string,
  scanId: string,
  options: ListEventsOptions = {},
) {
  const scan = await getScan(db, workspaceId, scanId);
  if (!scan) throw DbError.notFound("scan", scanId);
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const conditions = [eq(scanEvents.scanId, scanId), eq(scanEvents.workspaceId, workspaceId)];
  if (options.afterSeq !== undefined) {
    conditions.push(gt(scanEvents.seq, options.afterSeq));
  }
  return db
    .select()
    .from(scanEvents)
    .where(and(...conditions))
    .orderBy(scanEvents.seq)
    .limit(limit);
}
