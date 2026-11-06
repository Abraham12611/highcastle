import { createServer, type Server } from "node:http";

export interface HealthPayload {
  status: "ok";
  service: "worker";
  uptimeSeconds: number;
  timestamp: string;
}

export function healthPayload(startedAtMs: number, now: Date = new Date()): HealthPayload {
  return {
    status: "ok",
    service: "worker",
    uptimeSeconds: Math.max(0, Math.round((now.getTime() - startedAtMs) / 1000)),
    timestamp: now.toISOString(),
  };
}

export function createHealthServer(startedAtMs: number = Date.now()): Server {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(healthPayload(startedAtMs)));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
}
