/**
 * lab-v2-patched behavior matrix.
 *
 * The fix: invoice lookup is scoped to the actor's tenant, so a cross-tenant
 * id is indistinguishable from a nonexistent object (404, same error shape).
 * The oracle treats 403 or 404 as "denied"; this revision deliberately emits
 * 404 to also prevent id enumeration.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ALICE_TOKEN, BOB_TOKEN, bearer, getJson, startLab, type ErrorBody, type InvoiceBody, type RunningLab } from "./helpers.ts";

describe("lab-v2-patched", () => {
  let lab: RunningLab;
  before(async () => {
    lab = await startLab("lab-v2-patched");
  });
  after(async () => {
    await lab.close();
  });

  it("reports its revision identifiably in body and header", async () => {
    const res = await fetch(`${lab.baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-target-lab-revision"), "lab-v2-patched");
    const body = (await getJson(res)) as { revision: string };
    assert.equal(body.revision, "lab-v2-patched");
  });

  it("P1 baseline: Alice reads her own invoice_A (200, owner user_A)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) });
    assert.equal(res.status, 200);
    const body = (await getJson(res)) as InvoiceBody;
    assert.equal(body.invoice.ownerId, "user_A");
    assert.equal(body.invoice.tenantId, "tenant_A");
  });

  it("S1 fixed: Alice is denied Bob's invoice_B (404 INVOICE_NOT_FOUND)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: bearer(ALICE_TOKEN) });
    assert.equal(res.status, 404);
    const body = (await getJson(res)) as ErrorBody;
    assert.equal(body.error.code, "INVOICE_NOT_FOUND");
  });

  it("denial is indistinguishable from a truly unknown id (no enumeration)", async () => {
    const cross = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: bearer(ALICE_TOKEN) });
    const missing = await fetch(`${lab.baseUrl}/api/invoices/invoice_DOES_NOT_EXIST`, { headers: bearer(ALICE_TOKEN) });
    assert.equal(cross.status, missing.status);
    const crossBody = (await getJson(cross)) as ErrorBody;
    const missingBody = (await getJson(missing)) as ErrorBody;
    assert.equal(crossBody.error.code, missingBody.error.code);
    assert.equal(crossBody.error.message.replace(/'[^']*'/, "'X'"), missingBody.error.message.replace(/'[^']*'/, "'X'"));
  });

  it("fix is symmetric: Bob is denied Alice's invoice_A", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(BOB_TOKEN) });
    assert.equal(res.status, 404);
    const body = (await getJson(res)) as ErrorBody;
    assert.equal(body.error.code, "INVOICE_NOT_FOUND");
  });

  it("Bob still reads his own invoice_B (200) — legitimate access preserved", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: bearer(BOB_TOKEN) });
    assert.equal(res.status, 200);
    const body = (await getJson(res)) as InvoiceBody;
    assert.equal(body.invoice.ownerId, "user_B");
  });

  it("cookie session path enforces authorization the same way", async () => {
    const login = await fetch(`${lab.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ALICE_TOKEN }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: { cookie } });
    assert.equal(res.status, 404);
  });

  it("unauthenticated requests are denied (401)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`);
    assert.equal(res.status, 401);
    const body = (await getJson(res)) as ErrorBody;
    assert.equal(body.error.code, "UNAUTHENTICATED");
  });
});
