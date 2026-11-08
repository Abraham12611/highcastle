import { afterEach, describe, expect, it } from "vitest";
import { createHealthServer, healthPayload } from "./health.js";
import type { Server } from "node:http";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe("healthPayload", () => {
  it("reports ok status with computed uptime", () => {
    const now = new Date("2026-11-06T00:00:10.000Z");
    expect(healthPayload(now.getTime() - 5000, now)).toEqual({
      status: "ok",
      service: "worker",
      uptimeSeconds: 5,
      timestamp: "2026-11-06T00:00:10.000Z",
    });
  });
});

describe("createHealthServer", () => {
  it("serves GET /healthz with an ok JSON payload", async () => {
    const server = createHealthServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("worker");
  });

  it("returns 404 for unknown paths", async () => {
    const server = createHealthServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/nope`);
    expect(res.status).toBe(404);
  });
});
