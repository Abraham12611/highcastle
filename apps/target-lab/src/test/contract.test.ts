/**
 * Shared contract tests — identical expectations on BOTH revisions.
 *
 * Proves the two builds expose the same API surface, the same deterministic
 * fixtures, the same error taxonomy, and differ ONLY in the invoice
 * authorization outcome. This is what lets the L15 oracle attribute a
 * different S1 result to the patch rather than to contract drift.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LabRevision } from "../types.ts";
import { ALICE_TOKEN, BOB_TOKEN, bearer, startLab, type ErrorBody, type InvoiceBody, type RunningLab } from "./helpers.ts";

const REVISIONS: LabRevision[] = ["lab-v1-vulnerable", "lab-v2-patched"];

for (const revision of REVISIONS) {
  describe(`shared contract on ${revision}`, () => {
    let lab: RunningLab;
    beforeAll(async () => {
      lab = await startLab(revision);
    });
    afterAll(async () => {
      await lab.close();
    });

    it("GET /health returns 200 with revision + SemVer fixtureVersion, no secrets", async () => {
      const res = await fetch(`${lab.baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.revision).toBe(revision);
      // Contract: packages/contracts SemVerSchema (strict MAJOR.MINOR.PATCH).
      expect(body.fixtureVersion).toBe("1.0.0");
      expect(body.fixtureVersion).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
      expect(JSON.stringify(body)).not.toContain("lab-token");
    });

    it("GET /ready returns 200 with seeded fixture counts", async () => {
      const res = await fetch(`${lab.baseUrl}/ready`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; fixtures: { invoices: number; expected: number } };
      expect(body.status).toBe("ready");
      expect(body.fixtures.invoices).toBe(2);
    });

    it("GET /api/meta exposes fixture ids but never token values", async () => {
      const res = await fetch(`${lab.baseUrl}/api/meta`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        revision: string;
        fixtureVersion: string;
        fixtures: { users: { userId: string }[]; invoices: { id: string; ownerId: string }[] };
      };
      expect(body.revision).toBe(revision);
      expect(body.fixtureVersion).toBe("1.0.0");
      const invoiceIds = body.fixtures.invoices.map((i) => i.id).sort();
      expect(invoiceIds).toEqual(["invoice_A", "invoice_B"]);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain("lab-token-");
      expect(raw).not.toContain("lab-session-");
    });

    it("invoice success envelope is stable: { invoice, meta }", async () => {
      const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as InvoiceBody;
      expect(Object.keys(body).sort()).toEqual(["invoice", "meta"]);
      expect(Object.keys(body.invoice).sort()).toEqual([
        "amountCents", "currency", "customer", "dueAt", "id", "issuedAt", "lines", "number", "ownerId", "status", "tenantId",
      ]);
      expect(body.meta.revision).toBe(revision);
      expect(body.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("error envelope is stable: { error: { code, message }, meta }", async () => {
      const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`);
      const body = (await res.json()) as ErrorBody;
      expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
      expect(body.meta.revision).toBe(revision);
    });

    it("POST /api/auth/login issues a deterministic lab_session cookie", async () => {
      const res = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: ALICE_TOKEN }),
      });
      expect(res.status).toBe(200);
      const cookie = res.headers.get("set-cookie")!;
      expect(cookie).toMatch(/^lab_session=lab-session-user_A;/);
      expect(cookie).toMatch(/HttpOnly/);
      const body = (await res.json()) as { actor: { userId: string; label: string } };
      expect(body.actor.userId).toBe("user_A");
      expect(body.actor.label).toBe("alice");
    });

    it("POST /api/auth/login rejects unknown tokens (401)", async () => {
      const res = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "not-a-fixture-token" }),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("UNAUTHENTICATED");
    });

    it("GET /api/auth/whoami resolves bearer and cookie identically", async () => {
      const viaBearer = await fetch(`${lab.baseUrl}/api/auth/whoami`, { headers: bearer(BOB_TOKEN) });
      expect(viaBearer.status).toBe(200);
      const login = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: BOB_TOKEN }),
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
      const viaCookie = await fetch(`${lab.baseUrl}/api/auth/whoami`, { headers: { cookie } });
      const b1 = (await viaBearer.json()) as { actor: unknown };
      const b2 = (await viaCookie.json()) as { actor: unknown };
      expect(b2.actor).toEqual(b1.actor);
    });

    it("POST /api/auth/logout expires the session cookie", async () => {
      const login = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: ALICE_TOKEN }),
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
      const logout = await fetch(`${lab.baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie } });
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")!).toMatch(/Max-Age=0/);
    });

    it("fixtures are deterministic and read-only across restarts", async () => {
      const first = (await (
        await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) })
      ).json()) as InvoiceBody;
      const secondLab = await startLab(revision);
      try {
        const second = (await (
          await fetch(`${secondLab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) })
        ).json()) as InvoiceBody;
        expect(second.invoice).toEqual(first.invoice);
      } finally {
        await secondLab.close();
      }
    });

    it("unknown route returns 404 NOT_FOUND", async () => {
      const res = await fetch(`${lab.baseUrl}/api/does-not-exist`, { headers: bearer(ALICE_TOKEN) });
      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("mutating invoice routes are not offered (405/404)", async () => {
      const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, {
        method: "DELETE",
        headers: bearer(ALICE_TOKEN),
      });
      expect(res.status).toBe(405);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
      expect(res.headers.get("allow")).toBe("GET");
    });

    it("there is no state-mutating fixture reset endpoint", async () => {
      for (const method of ["POST", "PUT", "DELETE"]) {
        const res = await fetch(`${lab.baseUrl}/api/fixtures/reset`, { method });
        expect([404, 405]).toContain(res.status);
      }
    });

    it("malformed JSON body returns 400 INVALID_REQUEST", async () => {
      const res = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("INVALID_REQUEST");
    });
  });
}
