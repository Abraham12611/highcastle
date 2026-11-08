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
 * Session resolution: real signed-cookie verification via L05's adapter
 * (`getHighCastleSession`). Returns `null` (→ HTTP 401) for missing, forged
 * or expired credentials. There is no anonymous access, test bypass, or
 * query-string token.
 */
export async function resolveSession(): Promise<StreamSession | null> {
  const { headers } = await import("next/headers");
  const { getHighCastleSession } = await import("../../../../../../server/auth/session");
  const session = await getHighCastleSession(await headers());
  return session ? { userId: session.userId } : null;
}

/**
 * Scan→workspace/project lookup, provided by deployment wiring (L02/L18
 * registers a DB-backed implementation). Defaults to deny — a scan whose
 * workspace cannot be confirmed is never streamed.
 */
export type ScanScopeLookup = (scanId: string) => Promise<StreamScanScope | null>;

let scanScopeLookup: ScanScopeLookup = async () => null;

/** Register the L02/L18-backed scan→scope lookup at startup. */
export function configureScanScopeLookup(lookup: ScanScopeLookup): void {
  scanScopeLookup = lookup;
}

/**
 * Production deps: REAL signed-session verification (same adapter as
 * `resolveSession`) plus workspace-ownership authorization through L05's
 * `authorizeScanRead` — demo sessions may only ever read scans that resolve
 * inside the seeded demo workspace; account sessions require membership via
 * the injected MembershipPort. Denied ⇒ `null` ⇒ HTTP 404.
 */
export function liveDeps(store: StreamEventStore): StreamDeps {
  return {
    store,
    authorizer: {
      async authorizeScanRead(_session, scanId) {
        const { headers } = await import("next/headers");
        const { getHighCastleSession } = await import("../../../../../../server/auth/session");
        const { authorizeScanRead } = await import("../../../../../../server/auth/authorize");
        const session = await getHighCastleSession(await headers());
        if (!session) return null;
        return authorizeScanRead(session, scanId, scanScopeLookup);
      },
    },
  };
}

/** Event store seam: real persistence is L02/L17's to wire; until then reads
 *  fail closed AFTER auth+authz, never before. */
export function failClosedStore(): StreamEventStore {
  return {
    async list(): Promise<ScanEvent[]> {
      throw new Error("event store not configured");
    },
  };
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
