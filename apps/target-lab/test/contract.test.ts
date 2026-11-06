/**
 * Shared contract tests — identical expectations on BOTH revisions.
 *
 * Proves the two builds expose the same API surface, the same deterministic
 * fixtures, the same error taxonomy, and differ ONLY in the invoice
 * authorization outcome. This is what lets the L15 oracle attribute a
 * different S1 result to the patch rather than to contract drift.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { LabRevision } from "../src/types.ts";
import { ALICE_TOKEN, BOB_TOKEN, bearer, getJson, startLab, type ErrorBody, type InvoiceBody, type RunningLab } from "./helpers.ts";

const REVISIONS: LabRevision[] = ["lab-v1-vulnerable", "lab-v2-patched"];

for (const revision of REVISIONS) {
  describe(`shared contract on ${revision}`, () => {
    let lab: RunningLab;
    before(async () => {
      lab = await startLab(revision);
    });
    after(async () => {
      await lab.close();
    });

    it("GET /health returns 200 with revision + fixtureVersion, no secrets", async () => {
      const res = await fetch(`${lab.baseUrl}/health`);
      assert.equal(res.status, 200);
      const body = (await getJson(res)) as Record<string, unknown>;
      assert.equal(body.status, "ok");
      assert.equal(body.revision, revision);
      assert.equal(body.fixtureVersion, "lab-fixtures-1.0.0");
      assert.ok(!JSON.stringify(body).includes("lab-token"), "health must not leak fixture tokens");
    });

    it("GET /ready returns 200 with seeded fixture counts", async () => {
      const res = await fetch(`${lab.baseUrl}/ready`);
      assert.equal(res.status, 200);
      const body = (await getJson(res)) as { status: string; fixtures: { invoices: number; expected: number } };
      assert.equal(body.status, "ready");
      assert.equal(body.fixtures.invoices, 2);
    });

    it("GET /api/meta exposes fixture ids but never token values", async () => {
      const res = await fetch(`${lab.baseUrl}/api/meta`);
      assert.equal(res.status, 200);
      const body = (await getJson(res)) as {
        revision: string;
        fixtures: { users: { userId: string }[]; invoices: { id: string; ownerId: string }[] };
      };
      assert.equal(body.revision, revision);
      const invoiceIds = body.fixtures.invoices.map((i) => i.id).sort();
      assert.deepEqual(invoiceIds, ["invoice_A", "invoice_B"]);
      const raw = JSON.stringify(body);
      assert.ok(!raw.includes("lab-token-"), "meta must not leak fixture tokens");
      assert.ok(!raw.includes("lab-session-"), "meta must not leak session ids");
    });

    it("invoice success envelope is stable: { invoice, meta }", async () => {
      const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) });
      assert.equal(res.status, 200);
      const body = (await getJson(res)) as InvoiceBody;
      assert.deepEqual(Object.keys(body).sort(), ["invoice", "meta"]);
      assert.deepEqual(
        Object.keys(body.invoice).sort(),
        ["amountCents", "currency", "customer", "dueAt", "id", "issuedAt", "lines", "number", "ownerId", "status", "tenantId"],
      );
      assert.equal(body.meta.revision, revision);
      assert.match(body.meta.requestId, /^[0-9a-f-]{36}$/);
    });

    it("error envelope is stable: { error: { code, message }, meta }", async () => {
      const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`);
      const body = (await getJson(res)) as ErrorBody;
      assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
      assert.equal(body.meta.revision, revision);
    });

    it("POST /api/auth/login issues a deterministic lab_session cookie", async () => {
      const res = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: ALICE_TOKEN }),
      });
      assert.equal(res.status, 200);
      const cookie = res.headers.get("set-cookie")!;
      assert.match(cookie, /^lab_session=lab-session-user_A;/);
      assert.match(cookie, /HttpOnly/);
      const body = (await getJson(res)) as { actor: { userId: string; label: string } };
      assert.equal(body.actor.userId, "user_A");
      assert.equal(body.actor.label, "alice");
    });

    it("POST /api/auth/login rejects unknown tokens (401)", async () => {
      const res = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "not-a-fixture-token" }),
      });
      assert.equal(res.status, 401);
      const body = (await getJson(res)) as ErrorBody;
      assert.equal(body.error.code, "UNAUTHENTICATED");
    });

    it("GET /api/auth/whoami resolves bearer and cookie identically", async () => {
      const viaBearer = await fetch(`${lab.baseUrl}/api/auth/whoami`, { headers: bearer(BOB_TOKEN) });
      assert.equal(viaBearer.status, 200);
      const login = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: BOB_TOKEN }),
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
      const viaCookie = await fetch(`${lab.baseUrl}/api/auth/whoami`, { headers: { cookie } });
      const b1 = (await getJson(viaBearer)) as { actor: unknown };
      const b2 = (await getJson(viaCookie)) as { actor: unknown };
      assert.deepEqual(b1.actor, b2.actor);
    });

    it("POST /api/auth/logout invalidates the session cookie", async () => {
      const login = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: ALICE_TOKEN }),
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
      const logout = await fetch(`${lab.baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie } });
      assert.equal(logout.status, 200);
      assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
    });

    it("POST /api/fixtures/reset restores canonical fixture state", async () => {
      const res = await fetch(`${lab.baseUrl}/api/fixtures/reset`, { method: "POST" });
      assert.equal(res.status, 200);
      const body = (await getJson(res)) as { status: string; fixtures: { invoices: number } };
      assert.equal(body.status, "reset");
      assert.equal(body.fixtures.invoices, 2);
    });

    it("fixtures are deterministic across reset and restart", async () => {
      await fetch(`${lab.baseUrl}/api/fixtures/reset`, { method: "POST" });
      const first = (await (await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) })).json()) as InvoiceBody;
      const secondLab = await startLab(revision);
      try {
        const second = (await (
          await fetch(`${secondLab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) })
        ).json()) as InvoiceBody;
        assert.deepEqual(second.invoice, first.invoice);
      } finally {
        await secondLab.close();
      }
    });

    it("unknown route returns 404 NOT_FOUND", async () => {
      const res = await fetch(`${lab.baseUrl}/api/does-not-exist`, { headers: bearer(ALICE_TOKEN) });
      assert.equal(res.status, 404);
      const body = (await getJson(res)) as ErrorBody;
      assert.equal(body.error.code, "NOT_FOUND");
    });

    it("wrong method on a known route returns 405 METHOD_NOT_ALLOWED", async () => {
      const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, {
        method: "DELETE",
        headers: bearer(ALICE_TOKEN),
      });
      assert.equal(res.status, 405);
      const body = (await getJson(res)) as ErrorBody;
      assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
      assert.equal(res.headers.get("allow"), "GET");
    });

    it("malformed JSON body returns 400 INVALID_REQUEST", async () => {
      const res = await fetch(`${lab.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      assert.equal(res.status, 400);
      const body = (await getJson(res)) as ErrorBody;
      assert.equal(body.error.code, "INVALID_REQUEST");
    });
  });
}
