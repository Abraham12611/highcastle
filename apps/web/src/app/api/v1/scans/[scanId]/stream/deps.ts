import type { ScanEvent } from "@highcastle/contracts";

/**
 * Stream-endpoint seams. These interfaces mirror
 * `apps/worker/src/events/ports.ts` structurally so the route can bind the
 * real worker service once L02 (persistence) and L05 (session) land — without
 * importing worker code into the web bundle today. The swap is mechanical:
 * pass L02's tenant-scoped readers and the Better Auth session through
 * `StreamDeps` / `resolveSession`.
 */

export interface StreamSession {
  userId: string;
}

export interface StreamScanScope {
  workspaceId: string;
  projectId: string;
}

export interface StreamEventStore {
  list(
    scanId: string,
    workspaceId: string,
    options?: { afterSeq?: number; limit?: number },
  ): Promise<ScanEvent[]>;
}

export interface StreamAuthorizer {
  authorizeScanRead(
    session: StreamSession,
    scanId: string,
  ): Promise<StreamScanScope | null>;
}

export interface StreamDeps {
  store: StreamEventStore;
  authorizer: StreamAuthorizer;
  pollIntervalMs?: number;
  heartbeatMs?: number;
}

/**
 * Production defaults: fail closed. Session resolution returns `null`
 * (→ HTTP 401) until L05 wires Better Auth here, and the authorizer denies
 * every read (→ HTTP 404). The store throws if ever reached, as defense in
 * depth. There is no anonymous access, test bypass, or query-string token.
 */
export async function resolveSession(): Promise<StreamSession | null> {
  // L05 INTEGRATION POINT: return the Better Auth session's user, e.g.
  // `auth.api.getSession({ headers })` mapped to `{ userId }`.
  return null;
}

export function failClosedDeps(): StreamDeps {
  const unreachableStore: StreamEventStore = {
    async list(): Promise<ScanEvent[]> {
      throw new Error("event store not configured");
    },
  };
  return {
    store: unreachableStore,
    authorizer: {
      async authorizeScanRead(): Promise<null> {
        return null;
      },
    },
  };
}
