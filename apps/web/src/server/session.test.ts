import { describe, expect, it } from "vitest";
import { DEMO_WORKSPACE_ID } from "@/lib/auth/session-core";
import { resolveSession } from "@/server/session";
import { handle } from "@/server/route";
import { demoSession, signedCookieHeader, signedRequest } from "@/server/test-helpers";

/**
 * Signed-session boundary tests: every BFF request resolves through L05
 * verification. Missing, expired, or forged cookies authenticate nobody —
 * the route wrapper answers 401 before any database or queue is touched.
 */

describe("signed session boundary", () => {
  it("resolves a server-minted demo cookie to the pinned lab tenant", async () => {
    const session = await resolveSession(signedRequest(demoSession()));
    expect(session?.kind).toBe("demo");
    if (session?.kind === "demo") {
      expect(session.workspaceId).toBe(DEMO_WORKSPACE_ID);
    }
  });

  it("resolves a forged cookie to nobody", async () => {
    const forged = new Request("https://app.test/api/v1/me", {
      headers: { cookie: `${signedCookieHeader(demoSession())}tampered` },
    });
    expect(await resolveSession(forged)).toBeNull();
  });

  it("resolves a missing cookie to nobody", async () => {
    expect(await resolveSession(new Request("https://app.test/api/v1/me"))).toBeNull();
  });

  it("answers 401 with the contract envelope when no session exists", async () => {
    const res = await handle(
      new Request("https://app.test/api/v1/me"),
      "GET /api/v1/me",
      {},
      async () => ({ status: 200, body: { data: null } }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("answers 403 with the contract envelope on cross-origin mutations", async () => {
    const res = await handle(
      new Request("https://app.test/api/v1/projects/x/scans", {
        method: "POST",
        headers: { origin: "https://evil.test", host: "app.test" },
      }),
      "POST /api/v1/projects/:pid/scans",
      {},
      async () => ({ status: 200, body: { data: null } }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });
});
