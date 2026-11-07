import type {
  ScanEvent,
  ScanId,
  WorkspaceId,
} from "@highcastle/contracts";
import { EventStoreError } from "./errors.js";
import type {
  AppendEventInput,
  EventStore,
  ListEventsOptions,
} from "./ports.js";

/**
 * Postgres-backed `EventStore` over the documented `scans` / `scan_events`
 * tables (`docs/architecture/03_DATABASE_SCHEMA.md`).
 *
 * TEMPORARY SEAM (remove when L02 PR #18 merges): this adapter exists so the
 * transport can be proven against real PostgreSQL semantics today. It owns
 * no migrations and no Drizzle tables — once `@highcastle/db` lands, delete
 * this file and bind `EventService` directly to L02's `appendScanEvent` /
 * `listScanEvents`, whose signatures these methods mirror.
 *
 * Concurrency: `seq` is assigned as `MAX(seq)+1` per scan with a bounded
 * retry on unique-violation (`23505`), so parallel writers still produce a
 * gapless 1..N sequence — the same guarantee as L02's row-locked writer.
 */

const MAX_SEQ_RETRIES = 8;

export interface PgPool {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

interface ScanEventRow {
  id: unknown;
  workspace_id: unknown;
  scan_id: unknown;
  seq: unknown;
  event_type: unknown;
  phase: unknown;
  actor_type: unknown;
  safe_summary: unknown;
  payload_redacted: unknown;
  attempt_id: unknown;
  occurred_at: unknown;
}

export class PostgresEventStore implements EventStore {
  /** Per-scan in-process serialization tails. */
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly pool: PgPool,
    private readonly maxRetries: number = MAX_SEQ_RETRIES,
  ) {}

  async append(input: AppendEventInput): Promise<ScanEvent> {
    // Serialize in-process writers per scan so concurrent publishes do not
    // burn the unique-violation budget on each other; cross-process races
    // remain safe through the 23505 retry in `appendInner`.
    const previous = this.tails.get(input.scanId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(input.scanId, previous.then(() => current));
    await previous;
    try {
      return await this.appendInner(input);
    } finally {
      release();
      if (this.tails.get(input.scanId) === current) {
        this.tails.delete(input.scanId);
      }
    }
  }

  private async appendInner(input: AppendEventInput): Promise<ScanEvent> {
    await this.requireScan(input.scanId, input.workspaceId);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const maxResult = await this.pool.query(
          "SELECT COALESCE(MAX(seq), 0) AS max_seq FROM scan_events WHERE scan_id = $1",
          [input.scanId],
        );
        const next = Number(maxResult.rows[0]?.["max_seq"] ?? 0) + 1;
        const inserted = await this.pool.query(
          `INSERT INTO scan_events
             (id, workspace_id, scan_id, seq, event_type, phase, actor_type,
              safe_summary, payload_redacted, attempt_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
           RETURNING *`,
          [
            crypto.randomUUID(),
            input.workspaceId,
            input.scanId,
            next,
            input.eventType,
            input.phase ?? null,
            input.actorType,
            input.safeSummary,
            JSON.stringify(input.payloadRedacted ?? {}),
            input.attemptId ?? null,
          ],
        );
        const row = inserted.rows[0] as ScanEventRow | undefined;
        if (!row) throw new EventStoreError("unavailable", "event insert returned no row");
        return toScanEvent(row);
      } catch (error) {
        lastError = error;
        if (!isUniqueViolation(error) || attempt === this.maxRetries - 1) {
          throw toStoreError(error);
        }
      }
    }
    throw toStoreError(lastError);
  }

  async list(
    scanId: ScanId,
    workspaceId: WorkspaceId,
    options: ListEventsOptions = {},
  ): Promise<ScanEvent[]> {
    await this.requireScan(scanId, workspaceId);
    const after = options.afterSeq ?? 0;
    const limit = options.limit ?? 100;
    const result = await this.pool.query(
      `SELECT * FROM scan_events
        WHERE scan_id = $1 AND workspace_id = $2 AND seq > $3
        ORDER BY seq ASC LIMIT $4`,
      [scanId, workspaceId, after, limit],
    );
    return result.rows.map((row) => toScanEvent(row as unknown as ScanEventRow));
  }

  private async requireScan(
    scanId: ScanId,
    workspaceId: WorkspaceId,
  ): Promise<void> {
    const result = await this.pool.query(
      "SELECT workspace_id FROM scans WHERE id = $1",
      [scanId],
    );
    const owner = result.rows[0]?.["workspace_id"];
    if (owner === undefined || owner !== workspaceId) {
      // Unknown scan and foreign workspace read identically: missing.
      throw new EventStoreError("not_found", "scan not found");
    }
  }
}

function toScanEvent(row: ScanEventRow): ScanEvent {
  const occurredAt = row.occurred_at;
  // UUID columns map to branded contract IDs; `EventService.publish`
  // re-validates every stored record through `ScanEventSchema`, so a corrupt
  // row fails loudly at the service boundary instead of leaking downstream.
  return {
    id: String(row.id) as ScanEvent["id"],
    workspaceId: String(row.workspace_id) as ScanEvent["workspaceId"],
    scanId: String(row.scan_id) as ScanEvent["scanId"],
    seq: Number(row.seq),
    schemaVersion: 1,
    eventType: row.event_type as ScanEvent["eventType"],
    phase: (row.phase ?? null) as ScanEvent["phase"],
    actorType: row.actor_type as ScanEvent["actorType"],
    safeSummary: String(row.safe_summary),
    payloadRedacted: (row.payload_redacted ?? {}) as Record<string, unknown>,
    attemptId: (row.attempt_id ?? null) as ScanEvent["attemptId"],
    occurredAt:
      occurredAt instanceof Date ? occurredAt.toISOString() : String(occurredAt),
  };
}

function isUniqueViolation(error: unknown): boolean {
  // node-postgres reports `code` as the string "23505"; PGlite reports the
  // number 23505. Accept both so the retry path works on either driver.
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code: unknown }).code;
  return code === "23505" || code === 23505;
}

function toStoreError(error: unknown): EventStoreError {
  if (error instanceof EventStoreError) return error;
  return new EventStoreError(
    "unavailable",
    error instanceof Error ? error.message : "event store unavailable",
  );
}
