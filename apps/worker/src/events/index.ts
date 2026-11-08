/**
 * `apps/worker/src/events` — durable scan events and live SSE transport (L17).
 *
 * L16 consumes `EventService` (via `createEventService`) to publish
 * validated events; persistence is the source of truth and notification
 * follows it. The HTTP transport lives in the delegated web route
 * `apps/web/src/app/api/v1/scans/[scanId]/stream/`, which adapts these
 * framework-agnostic primitives.
 */

export { EventStoreError, EventValidationError } from "./errors.js";
export { EventHub } from "./hub.js";
export { EventService, createEventService } from "./service.js";
export type { ScanReader } from "./service.js";
export {
  HEARTBEAT_COMMENT,
  HEARTBEAT_MS_DEFAULT,
  POLL_INTERVAL_MS_DEFAULT,
  SSE_CONTENT_TYPE,
  encodeHeartbeat,
  encodeSseEvent,
  parseResumeCursor,
  streamScanEvents,
  toBrowserPayload,
} from "./sse.js";
export type { BrowserPayload, StreamScanEventsOptions } from "./sse.js";
export { InMemoryEventStore } from "./store-memory.js";
export { PostgresEventStore } from "./store-postgres.js";
export type { PgPool } from "./store-postgres.js";
export { failClosedAuthorizer, resolveSession } from "./auth.js";
export type {
  AppendEventInput,
  EventNotification,
  EventStore,
  ListEventsOptions,
  ScanAuthorization,
  ScanScope,
  Session,
} from "./ports.js";
