import type {
  ActorType,
  AttemptId,
  ScanEvent,
  ScanEventType,
  ScanId,
  ScanPhase,
  WorkspaceId,
} from "@highcastle/contracts";

/**
 * L17 ports — explicit seams between the event transport and its neighbors.
 *
 * - Persistence: `EventStore`. Production backing is L02's
 *   `appendScanEvent` / `listScanEvents` (`@highcastle/db`, PR #18); the
 *   method shapes here mirror those functions so the swap is mechanical.
 *   Until PR #18 merges, production wiring stays unconfigured (fail closed)
 *   and tests use the in-memory or PGlite-backed implementations.
 * - Authorization: `ScanAuthorization.authorizeScanRead`. Implemented by
 *   L05 (session) + L02 (membership/scan join); the default denies.
 * - Liveness: `EventNotification` wakes SSE loops early; polling the store
 *   remains the source of truth so a lost wakeup can never lose events.
 */

export interface Session {
  userId: string;
}

export interface ScanScope {
  workspaceId: string;
  projectId: string;
}

/** Event data accepted for persistence. `id`/`seq`/`occurredAt` are assigned
 * by the store so concurrent writers cannot collide or reorder. */
export interface AppendEventInput {
  workspaceId: WorkspaceId;
  scanId: ScanId;
  eventType: ScanEventType;
  phase?: ScanPhase | null;
  actorType: ActorType;
  safeSummary: string;
  payloadRedacted?: Record<string, unknown>;
  attemptId?: AttemptId | null;
}

export interface ListEventsOptions {
  afterSeq?: number;
  limit?: number;
}

export interface EventStore {
  append(input: AppendEventInput): Promise<ScanEvent>;
  list(scanId: ScanId, workspaceId: WorkspaceId, options?: ListEventsOptions): Promise<ScanEvent[]>;
}

export interface ScanAuthorization {
  authorizeScanRead(session: Session, scanId: ScanId): Promise<ScanScope | null>;
}

/** Fired after an event is durably persisted. Never before. */
export type EventNotification = (scanId: string, seq: number) => void;
