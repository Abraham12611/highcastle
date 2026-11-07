import { createHealthServer } from "./health.js";
import { startQueue } from "./jobs/pg-boss-queue.js";
import { registerHandlers } from "./jobs/registration.js";
import { wireProductionDeps, IntegrationBlockedError } from "./adapters/index.js";
import { JOB_NAMES } from "./jobs/payloads.js";

// Orchestration is owned by L16. The pg-boss consumer runs against the same
// Postgres as the app DB; flows delegate to L02/L04/L12/L14/L15 packages via
// the adapter ports in ./adapters. Until those lanes merge, the worker keeps
// serving health and reports the blocked integrations honestly — never
// substitutes fake implementations.

const port = Number.parseInt(process.env.WORKER_PORT ?? "3010", 10);
const server = createHealthServer(Date.now());

let queueHandle: { stop(): Promise<void> } | null = null;

async function startOrchestration(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[worker] DATABASE_URL unset — orchestration disabled (health shell only)");
    return;
  }
  const handle = await startQueue(databaseUrl);
  queueHandle = handle;
  try {
    const deps = wireProductionDeps({ queue: handle.queue });
    const ids = await registerHandlers(handle.boss, deps);
    await handle.boss.schedule(JOB_NAMES.orphanReap, "*/5 * * * *", {});
    console.log(`[worker] orchestration live: ${ids.length} job handlers + orphan_reap schedule`);
  } catch (err) {
    if (err instanceof IntegrationBlockedError) {
      console.warn(`[worker] ${err.message}`);
      console.warn("[worker] queue running; flow handlers will attach when lanes merge");
      return;
    }
    throw err;
  }
}

server.listen(port, () => {
  console.log(`[worker] health endpoint listening on http://localhost:${port}/healthz`);
  void startOrchestration().catch((err: unknown) => {
    console.error("[worker] orchestration failed to start:", err);
  });
});

function shutdown(signal: string): void {
  console.log(`[worker] ${signal} received, shutting down`);
  void (queueHandle?.stop() ?? Promise.resolve()).finally(() =>
    server.close(() => process.exit(0)),
  );
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
