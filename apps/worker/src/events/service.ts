import { ScanEventCursorSchema, ScanEventSchema } from "@highcastle/contracts";
import { EventValidationError } from "./errors.js";
import type {
  AppendEventInput,
  EventNotification,
  EventStore,
  ScanScope,
  Session,
} from "./ports.js";
import type { ScanAuthorization } from "./ports.js";
import type { ScanEvent, ScanId, WorkspaceId } from "@highcastle/contracts";

/**
 * `EventService` is the single writer path L16 consumes: validate the
 * accepted shape, persist atomically through the store, then notify live
 * subscribers. Notification always follows persistence — a subscriber can
 * never observe an event the store does not have.
 */

const MAX_PAYLOAD_BYTES = 32 * 1024;

const HISTORY_LIMIT_MAX = 500;
const HISTORY_LIMIT_DEFAULT = 100;

function parseHistoryLimit(raw: unknown): number {
  const value = raw === undefined ? HISTORY_LIMIT_DEFAULT : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > HISTORY_LIMIT_MAX) {
    throw new EventValidationError(`limit must be an integer 1..${HISTORY_LIMIT_MAX}`);
  }
  return value;
}

export interface ScanReader {
  readHistory(
    scanId: ScanId,
    workspaceId: WorkspaceId,
    after: unknown,
    limit?: unknown,
  ): Promise<ScanEvent[]>;
}

export class EventService implements ScanReader {
  constructor(
    private readonly store: EventStore,
    private readonly notify?: EventNotification,
  ) {}

  /** Persist one accepted event and wake subscribers. Throws
   * `EventValidationError` for malformed input, `EventStoreError` for
   * missing scans or backend failures. */
  async publish(input: AppendEventInput): Promise<ScanEvent> {
    // Shape-check before touching the store so rejected input consumes no
    // sequence numbers and wakes no subscribers. The store fills the real
    // id/seq/occurredAt; this provisional record exercises the same schema.
    const shape = ScanEventSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000000",
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      seq: 1,
      schemaVersion: 1,
      eventType: input.eventType,
      phase: input.phase ?? null,
      actorType: input.actorType,
      safeSummary: input.safeSummary,
      payloadRedacted: input.payloadRedacted ?? {},
      attemptId: input.attemptId ?? null,
      occurredAt: new Date(0).toISOString(),
    });
    if (!shape.success) {
      throw new EventValidationError(shape.error.issues[0]?.message ?? "invalid event input");
    }
    if (input.payloadRedacted !== undefined) {
      const bytes = JSON.stringify(input.payloadRedacted).length;
      if (bytes > MAX_PAYLOAD_BYTES) {
        throw new EventValidationError(`payloadRedacted exceeds ${MAX_PAYLOAD_BYTES} bytes`);
      }
    }
    const persisted = await this.store.append(input);
    // Full contract validation of the stored record (specialized per-type
    // rules: test.executed requires attemptId, finding.confirmed requires a
    // valid findingId). A store must never return an unshaped record.
    let event;
    try {
      event = ScanEventSchema.parse(persisted);
    } catch (error) {
      throw new EventValidationError(
        error instanceof Error ? error.message : "stored event failed validation",
      );
    }
    this.notify?.(event.scanId, event.seq);
    return event;
  }

  /** Ordered history after a validated cursor. Unknown scans or foreign
   * workspaces surface as `EventStoreError(not_found)` — never as data. */
  async readHistory(
    scanId: ScanId,
    workspaceId: WorkspaceId,
    after: unknown,
    limit?: unknown,
  ): Promise<ScanEvent[]> {
    let afterSeq: number;
    let take: number;
    try {
      afterSeq = ScanEventCursorSchema.parse(after ?? 0);
      take = parseHistoryLimit(limit);
    } catch (error) {
      throw new EventValidationError(error instanceof Error ? error.message : "invalid cursor");
    }
    return this.store.list(scanId, workspaceId, {
      afterSeq,
      limit: take,
    });
  }
}

/** L16 entry point shape: publish through a service bound to its store. */
export function createEventService(store: EventStore, notify?: EventNotification): EventService {
  return new EventService(store, notify);
}

export type { ScanAuthorization, ScanScope, Session };
