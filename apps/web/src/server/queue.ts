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

export interface SendOptions {
  /**
   * Deduplication key (the request's Idempotency-Key). pg-boss registers it
   * as a singleton key so a retried submission cannot launch a second job —
   * safe to call on every retry, including the crash window where the scan
   * row exists but no job was enqueued yet.
   */
  singletonKey?: string;
}

export interface JobQueue {
  readonly available: boolean;
  sendScanJob(scanId: string, options?: SendOptions): Promise<void>;
  sendReplayJob(replayId: string, options?: SendOptions): Promise<void>;
  sendCancelScanJob(scanId: string): Promise<void>;
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
    options?: { singletonKey?: string },
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
      const { default: PgBoss } = (await import("pg-boss")) as unknown as {
        default: new (connection: string) => PgBossLike & {
          start(): Promise<unknown>;
        };
      };
      const instance = new PgBoss(connectionString) as PgBossLike & {
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
    await client.send(
      queue,
      data,
      options?.singletonKey === undefined
        ? undefined
        : { singletonKey: options.singletonKey },
    );
  };

  return {
    available: true,
    sendScanJob: (scanId: string, options?: SendOptions) =>
      send(SCAN_JOB_QUEUE, { scanId }, options),
    sendReplayJob: (replayId: string, options?: SendOptions) =>
      send(REPLAY_JOB_QUEUE, { replayId }, options),
    sendCancelScanJob: (scanId: string) =>
      send(SCAN_CANCEL_JOB_QUEUE, { scanId }),
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
