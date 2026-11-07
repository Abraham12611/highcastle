/**
 * Scan-job queue port.
 *
 * The durable queue is pg-boss on PostgreSQL (per `06_EVENTS_AND_JOBS.md`:
 * `scan.plan_and_execute`, `scan.cancel_and_cleanup`, `replay.execute`).
 * L16 owns the subscribers; this module owns the producer side for the BFF.
 * When no queue is configured the adapter refuses loudly (`QueueUnavailable`
 * → HTTP 503) instead of pretending the job was enqueued.
 */

export const SCAN_JOB_QUEUE = "scan.plan_and_execute";
export const REPLAY_JOB_QUEUE = "replay.execute";
export const SCAN_CANCEL_JOB_QUEUE = "scan.cancel_and_cleanup";

export class QueueUnavailable extends Error {
  constructor(
    message = "scan queue is not configured (set QUEUE_DATABASE_URL or DATABASE_URL)",
  ) {
    super(message);
    this.name = "QueueUnavailable";
  }
}

/**
 * Dedupe window for enqueue retries. Live-proven against pg-boss v12: a bare
 * `singletonKey` does NOT dedupe — the unique index only covers
 * (queue, key) inside a `singleton_on` time slot, which exists only when a
 * window is supplied. Without this, a retried submission while the first job
 * is still queued creates a second execution.
 */
export const JOB_ENQUEUE_DEDUPE_SECONDS = 86_400;

export interface SendOptions {
  /**
   * Deduplication key (the request's Idempotency-Key). Combined with
   * `singletonSeconds`, a retried submission returns null instead of a
   * second job id — safe to call on every retry, including the crash window
   * where the scan row exists but no job was enqueued yet.
   */
  singletonKey?: string;
  /** Dedupe window in seconds; defaults to JOB_ENQUEUE_DEDUPE_SECONDS. */
  singletonSeconds?: number;
}

/**
 * Producer-side job bodies. The L16 consumer validates strictly
 * (`scan.plan_and_execute`: `{workspaceId, scanId}`;
 * `replay.execute`: `{workspaceId, replayId}`;
 * `scan.cancel_and_cleanup`: `{workspaceId, scanId}`) and fails jobs with
 * anything else — so the BFF sends exactly that, never a bare id.
 */
export interface ScanJob {
  workspaceId: string;
  scanId: string;
}

export interface ReplayJob {
  workspaceId: string;
  replayId: string;
}

export interface JobQueue {
  readonly available: boolean;
  sendScanJob(job: ScanJob, options?: SendOptions): Promise<void>;
  sendReplayJob(job: ReplayJob, options?: SendOptions): Promise<void>;
  sendCancelScanJob(job: ScanJob): Promise<void>;
  close(): Promise<void>;
}

export function unavailableQueue(): JobQueue {
  const fail = async (): Promise<never> => {
    throw new QueueUnavailable();
  };
  return {
    available: false,
    sendScanJob: fail,
    sendReplayJob: fail,
    sendCancelScanJob: fail,
    async close(): Promise<void> {},
  };
}

interface PgBossLike {
  send(
    queue: string,
    data: Record<string, unknown>,
    options?: { singletonKey?: string; singletonSeconds?: number },
  ): Promise<string | null>;
  stop(): Promise<void>;
}

export function pgBossQueue(connectionString: string): JobQueue {
  let boss: PgBossLike | null = null;
  let starting: Promise<PgBossLike> | null = null;

  const start = async (): Promise<PgBossLike> => {
    if (boss) return boss;
    starting ??= (async () => {
      // Lazily required so unit tests and queue-less deployments never load
      // the driver. `pg-boss` auto-applies its own schema on start.
      // v12 exports a named `PgBoss`; older majors export it as default —
      // accept both, because `new (undefined)` fails closed at the worst
      // possible moment (live-proven during the Vultr E2E).
      const mod = (await import("pg-boss")) as unknown as {
        PgBoss?: new (connection: string) => PgBossLike & {
          start(): Promise<unknown>;
        };
        default?:
          | (new (connection: string) => PgBossLike & {
              start(): Promise<unknown>;
            })
          | { PgBoss: new (connection: string) => PgBossLike & {
              start(): Promise<unknown>;
            } };
      };
      const candidate = mod.PgBoss ?? mod.default;
      const Ctor =
        typeof candidate === "function"
          ? candidate
          : (candidate as { PgBoss: new (connection: string) => PgBossLike & {
              start(): Promise<unknown>;
            } }).PgBoss;
      const instance = new Ctor(connectionString) as PgBossLike & {
        start(): Promise<unknown>;
      };
      await instance.start();
      boss = instance;
      return instance;
    })();
    return starting;
  };

  const send = async (
    queue: string,
    data: Record<string, unknown>,
    options?: SendOptions,
  ) => {
    const client = await start();
    // A null return means "already enqueued inside the window" — not a
    // failure, so it is intentionally not surfaced to callers.
    await client.send(
      queue,
      data,
      options?.singletonKey === undefined
        ? undefined
        : {
            singletonKey: options.singletonKey,
            singletonSeconds:
              options.singletonSeconds ?? JOB_ENQUEUE_DEDUPE_SECONDS,
          },
    );
  };

  return {
    available: true,
    sendScanJob: (job: ScanJob, options?: SendOptions) =>
      send(SCAN_JOB_QUEUE, { workspaceId: job.workspaceId, scanId: job.scanId }, options),
    sendReplayJob: (job: ReplayJob, options?: SendOptions) =>
      send(REPLAY_JOB_QUEUE, { workspaceId: job.workspaceId, replayId: job.replayId }, options),
    sendCancelScanJob: (job: ScanJob) =>
      send(SCAN_CANCEL_JOB_QUEUE, { workspaceId: job.workspaceId, scanId: job.scanId }),
    async close(): Promise<void> {
      starting = null;
      const client = boss;
      boss = null;
      await client?.stop();
    },
  };
}

/** Production wiring: queue DB URL with DATABASE_URL as fallback. */
export function queueFromEnv(): JobQueue {
  const connectionString =
    process.env["QUEUE_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!connectionString) return unavailableQueue();
  return pgBossQueue(connectionString);
}
