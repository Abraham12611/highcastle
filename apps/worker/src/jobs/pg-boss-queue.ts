/**
 * Real durable queue: pg-boss over the same Postgres as the app DB.
 *
 * Delivery semantics are at-least-once — handlers must be idempotent
 * (flows re-check durable state before acting; singleton keys dedupe
 * concurrent enqueue of the same scan/replay).
 *
 * Retry policy is configured per queue at registration: bounded attempts
 * with exponential backoff, then dead-letter for operator attention — a
 * poisoned job can never loop forever.
 */
import { PgBoss } from "pg-boss";
import type { EnqueueOptions, JobQueue } from "../adapters/ports.js";
import { JOB_NAMES } from "./payloads.js";

export const QUEUE_RETRY = {
  /** Transport-class failures only; flow-level replans are separate. */
  scanRetryLimit: 2,
  retryDelaySeconds: 30,
  retryDelayMaxSeconds: 300,
  /** One orchestrated run may not exceed ten minutes end to end. */
  expireInSeconds: 600,
  retentionSeconds: 60 * 60 * 24,
} as const;

export class PgBossQueue implements JobQueue {
  constructor(private readonly boss: PgBoss) {}

  async send(name: string, payload: object, options: EnqueueOptions = {}): Promise<string | null> {
    return this.boss.send(name, payload, {
      retryLimit: QUEUE_RETRY.scanRetryLimit,
      retryDelay: QUEUE_RETRY.retryDelaySeconds,
      retryBackoff: true,
      retryDelayMax: QUEUE_RETRY.retryDelayMaxSeconds,
      expireInSeconds: QUEUE_RETRY.expireInSeconds,
      retentionSeconds: QUEUE_RETRY.retentionSeconds,
      ...(options.singletonKey !== undefined ? { singletonKey: options.singletonKey } : {}),
      ...(options.priority !== undefined ? { priority: options.priority } : {}),
      ...(options.startAfterSeconds !== undefined ? { startAfter: options.startAfterSeconds } : {}),
    });
  }
}

export interface QueueHandle {
  boss: PgBoss;
  queue: PgBossQueue;
  stop(): Promise<void>;
}

/**
 * Create and start the queue; idempotently provisions pg-boss schema and
 * declares every queue we consume (pg-boss 12 requires createQueue).
 */
export async function startQueue(connectionString: string): Promise<QueueHandle> {
  const boss = new PgBoss({
    connectionString,
    // Keep pg-boss internals in a dedicated schema; app tables stay owned by L02.
    schema: "pgboss",
  });
  await boss.start();
  for (const name of Object.values(JOB_NAMES)) {
    await boss.createQueue(name);
  }
  return {
    boss,
    queue: new PgBossQueue(boss),
    stop: () => boss.stop({ graceful: true }),
  };
}
