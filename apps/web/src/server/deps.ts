import type { Database } from "@highcastle/db";
import type { DnsResolver, SocketFactory } from "@highcastle/security";
import type { JobQueue } from "./queue";
import type { RateLimiter } from "./rate-limit";
import type { Session } from "./session";

/**
 * Per-request dependencies for every BFF flow. Routes build this from the
 * process singletons (`getRequestDb`, `queueFromEnv`); tests inject PGlite
 * databases and fake queues. Business logic never touches globals.
 */
export interface BffDeps {
  db: Database;
  queue: JobQueue;
  session: Session;
  now?: Date;
  scanLaunchLimiter?: RateLimiter;
  /** Passive-recon I/O — tests inject fakes so no real network leaves the
   *  process. When absent, flows use the production DNS/TLS impls. */
  recon?: {
    resolver: DnsResolver;
    fetcher: SocketFactory;
  };
}

export function requestTime(deps: BffDeps): Date {
  return deps.now ?? new Date();
}
