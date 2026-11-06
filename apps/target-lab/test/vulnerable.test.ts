/**
 * lab-v1-vulnerable behavior matrix.
 *
 * The deliberate defect: object-level authorization is missing, so an
 * authenticated actor can read ANY invoice by known id. These tests prove the
 * BOLA reproduces — by checking the RETURNED OWNER/FIELDS, not just the status
 * (the oracle contract in docs/agents/02_TEST_PACK_AND_VERIFICATION.md).
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ALICE_TOKEN, BOB_TOKEN, bearer, getJson, startLab, type ErrorBody, type InvoiceBody, type RunningLab } from "./helpers.ts";

describe("lab-v1-vulnerable", () => {
  let lab: RunningLab;
  before(async () => {
    lab = await startLab("lab-v1-vulnerable");
  });
  after(async () => {
    await lab.close();
  });

  it("reports its revision identifiably in body and header", async () => {
    const res = await fetch(`${lab.baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-target-lab-revision"), "lab-v1-vulnerable");
    const body = (await getJson(res)) as { revision: string };
    assert.equal(body.revision, "lab-v1-vulnerable");
  });

  it("P1 baseline: Alice reads her own invoice_A (200, owner user_A)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) });
    assert.equal(res.status, 200);
    const body = (await getJson(res)) as InvoiceBody;
    assert.equal(body.invoice.id, "invoice_A");
    assert.equal(body.invoice.ownerId, "user_A");
    assert.equal(body.invoice.tenantId, "tenant_A");
    assert.equal(body.invoice.number, "INV-2026-0001");
  });

  it("S1 defect: Alice reads Bob's invoice_B (200) — protected fields prove BOLA", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: bearer(ALICE_TOKEN) });
    assert.equal(res.status, 200);
    const body = (await getJson(res)) as InvoiceBody;
    // Oracle-relevant assertions: actual Bob-owned synthetic data crossed tenants.
    assert.equal(body.invoice.id, "invoice_B");
    assert.equal(body.invoice.ownerId, "user_B");
    assert.equal(body.invoice.tenantId, "tenant_B");
    assert.equal(body.invoice.customer.name, "Bob Fixture");
    assert.equal(body.invoice.customer.email, "bob@targetlab.test");
    assert.equal(body.invoice.amountCents, 54_250);
    assert.equal(body.invoice.number, "INV-2026-0002");
  });

  it("defect is symmetric: Bob reads Alice's invoice_A (200)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(BOB_TOKEN) });
    assert.equal(res.status, 200);
    const body = (await getJson(res)) as InvoiceBody;
    assert.equal(body.invoice.ownerId, "user_A");
    assert.equal(body.invoice.tenantId, "tenant_A");
  });

  it("defect survives the cookie session path, not just bearer tokens", async () => {
    const login = await fetch(`${lab.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ALICE_TOKEN }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = (await getJson(res)) as InvoiceBody;
    assert.equal(body.invoice.ownerId, "user_B");
  });

  it("unauthenticated requests are still denied (401) — auth exists, authz does not", async () => {
    for (const id of ["invoice_A", "invoice_B"]) {
      const res = await fetch(`${lab.baseUrl}/api/invoices/${id}`);
      assert.equal(res.status, 401);
      const body = (await getJson(res)) as ErrorBody;
      assert.equal(body.error.code, "UNAUTHENTICATED");
    }
  });

  it("invalid credentials are denied (401)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer("lab-token-mallory") });
    assert.equal(res.status, 401);
  });

  it("unknown invoice id returns 404 for an authenticated actor", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_ZZZ`, { headers: bearer(ALICE_TOKEN) });
    assert.equal(res.status, 404);
    const body = (await getJson(res)) as ErrorBody;
    assert.equal(body.error.code, "INVOICE_NOT_FOUND");
  });
});
