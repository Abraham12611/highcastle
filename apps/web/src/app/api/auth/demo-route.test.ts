import { beforeEach, describe, expect, it } from "vitest";
import { POST, DELETE } from "./demo/route";
import { GET } from "./session/route";
import { resetRateLimits } from "../../../lib/auth/rate-limit";

const BASE = "http://localhost:3000";
const req = (method: string, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/api/auth/demo`, { method, headers });

describe("POST /api/auth/demo", () => {
  beforeEach(() => resetRateLimits());

  it("mints an HttpOnly demo cookie (201)", async () => {
    const res = await POST(req("POST", { "x-highcastle-request": "1" }));
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("hc_demo=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=3600");
    const body = (await res.json()) as { session: { kind: string; targetAlias: string } };
    expect(body.session.kind).toBe("demo");
    expect(body.session.targetAlias).toBe("target-lab");
  });

  it("rejects cross-origin posts (CSRF 403)", async () => {
    const res = await POST(req("POST", { origin: "https://evil.example", host: "localhost:3000" }));
    expect(res.status).toBe(403);
    const resNoSignal = await POST(req("POST"));
    expect(resNoSignal.status).toBe(403);
  });

  it("rate-limits minting (429 after cap)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await POST(req("POST", { "x-highcastle-request": "1", "x-forwarded-for": "9.9.9.9" }));
      expect(res.status).toBe(201);
    }
    const blocked = await POST(req("POST", { "x-highcastle-request": "1", "x-forwarded-for": "9.9.9.9" }));
    expect(blocked.status).toBe(429);
  });

  it("DELETE revokes the demo cookie", async () => {
    const res = await DELETE(req("DELETE", { "x-highcastle-request": "1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("GET /api/auth/session", () => {
  beforeEach(() => resetRateLimits());

  it("401 when unauthenticated", async () => {
    const res = await GET(new Request(`${BASE}/api/auth/session`));
    expect(res.status).toBe(401);
  });

  it("returns the demo session when the minted cookie is presented", async () => {
    const mint = await POST(req("POST", { "x-highcastle-request": "1" }));
    const cookie = mint.headers.get("set-cookie")!.split(";")[0]!;
    const res = await GET(new Request(`${BASE}/api/auth/session`, { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { kind: string; userId: string } };
    expect(body.session.kind).toBe("demo");
    expect(body.session.userId).toMatch(/^guest-/);
  });

  it("forged cookie does not authenticate", async () => {
    const res = await GET(new Request(`${BASE}/api/auth/session`, { headers: { cookie: "hc_demo=AAAA.forged" } }));
    expect(res.status).toBe(401);
  });
});
