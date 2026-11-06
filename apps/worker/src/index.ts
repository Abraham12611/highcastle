import { createHealthServer } from "./health.js";

// Foundation shell only. The pg-boss consumer, policy gate (L13), orchestration
// flows (L16) and event publisher (L17) attach here once packages/db (L02) and
// packages/contracts (L03) exist. This process must never receive sandboxed
// execution duties, provider secrets beyond its own token, or a Docker socket.

const port = Number.parseInt(process.env.WORKER_PORT ?? "3010", 10);
const startedAtMs = Date.now();
const server = createHealthServer(startedAtMs);

server.listen(port, () => {
  console.log(`[worker] health endpoint listening on http://localhost:${port}/healthz`);
  console.log("[worker] no queue consumer wired yet — shell keeps process alive for health checks");
});

function shutdown(signal: string): void {
  console.log(`[worker] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
