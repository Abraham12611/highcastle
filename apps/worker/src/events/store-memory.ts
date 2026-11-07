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
 * In-memory `EventStore` for unit tests and local development. Same
 * semantics as the Postgres backing: scans must be registered before use,
 * sequences are gapless per scan, and every read is workspace-scoped — a
 * foreign workspace reads as missing, never as another tenant's data.
 */
export class InMemoryEventStore implements EventStore {
  private readonly scans = new Map<
    string,
    { workspaceId: string; projectId: string; events: ScanEvent[] }
  >();

  registerScan(scanId: ScanId, workspaceId: WorkspaceId, projectId: string): void {
    this.scans.set(scanId, { workspaceId, projectId, events: [] });
  }

  async append(input: AppendEventInput): Promise<ScanEvent> {
    const record = this.scans.get(input.scanId);
    if (!record || record.workspaceId !== input.workspaceId) {
      throw new EventStoreError("not_found", "scan not found");
    }
    const event: ScanEvent = {
      id: crypto.randomUUID() as ScanEvent["id"],
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      seq: record.events.length + 1,
      schemaVersion: 1,
      eventType: input.eventType,
      phase: input.phase ?? null,
      actorType: input.actorType,
      safeSummary: input.safeSummary,
      payloadRedacted: input.payloadRedacted ?? {},
      attemptId: input.attemptId ?? null,
      occurredAt: new Date().toISOString(),
    };
    record.events.push(event);
    return event;
  }

  async list(
    scanId: ScanId,
    workspaceId: WorkspaceId,
    options: ListEventsOptions = {},
  ): Promise<ScanEvent[]> {
    const record = this.scans.get(scanId);
    if (!record || record.workspaceId !== workspaceId) {
      throw new EventStoreError("not_found", "scan not found");
    }
    const after = options.afterSeq ?? 0;
    const limit = options.limit ?? 100;
    return record.events.filter((event) => event.seq > after).slice(0, limit);
  }
}
