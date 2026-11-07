/**
 * lab-v1-vulnerable behavior matrix.
 *
 * The deliberate defect: object-level authorization is missing, so an
 * authenticated actor can read ANY invoice by known id. These tests prove the
 * BOLA reproduces — by checking the RETURNED OWNER/FIELDS, not just the status
 * (the oracle contract in docs/agents/02_TEST_PACK_AND_VERIFICATION.md).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALICE_TOKEN, BOB_TOKEN, bearer, startLab, type ErrorBody, type InvoiceBody, type RunningLab } from "./helpers.ts";

describe("lab-v1-vulnerable", () => {
  let lab: RunningLab;
  beforeAll(async () => {
    lab = await startLab("lab-v1-vulnerable");
  });
  afterAll(async () => {
    await lab.close();
  });

  it("reports its revision identifiably in body and header", async () => {
    const res = await fetch(`${lab.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-target-lab-revision")).toBe("lab-v1-vulnerable");
    const body = (await res.json()) as { revision: string };
    expect(body.revision).toBe("lab-v1-vulnerable");
  });

  it("P1 baseline: Alice reads her own invoice_A (200, owner user_A)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(ALICE_TOKEN) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvoiceBody;
    expect(body.invoice.id).toBe("invoice_A");
    expect(body.invoice.ownerId).toBe("user_A");
    expect(body.invoice.tenantId).toBe("tenant_A");
    expect(body.invoice.number).toBe("INV-2026-0001");
  });

  it("S1 defect: Alice reads Bob's invoice_B (200) — protected fields prove BOLA", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: bearer(ALICE_TOKEN) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvoiceBody;
    // Oracle-relevant assertions: actual Bob-owned synthetic data crossed tenants.
    expect(body.invoice.id).toBe("invoice_B");
    expect(body.invoice.ownerId).toBe("user_B");
    expect(body.invoice.tenantId).toBe("tenant_B");
    expect(body.invoice.customer.name).toBe("Bob Fixture");
    expect(body.invoice.customer.email).toBe("bob@targetlab.test");
    expect(body.invoice.amountCents).toBe(54_250);
    expect(body.invoice.number).toBe("INV-2026-0002");
  });

  it("defect is symmetric: Bob reads Alice's invoice_A (200)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer(BOB_TOKEN) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvoiceBody;
    expect(body.invoice.ownerId).toBe("user_A");
    expect(body.invoice.tenantId).toBe("tenant_A");
  });

  it("defect survives the cookie session path, not just bearer tokens", async () => {
    const login = await fetch(`${lab.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ALICE_TOKEN }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_B`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvoiceBody;
    expect(body.invoice.ownerId).toBe("user_B");
  });

  it("unauthenticated requests are still denied (401) — auth exists, authz does not", async () => {
    for (const id of ["invoice_A", "invoice_B"]) {
      const res = await fetch(`${lab.baseUrl}/api/invoices/${id}`);
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("invalid credentials are denied (401)", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_A`, { headers: bearer("lab-token-mallory") });
    expect(res.status).toBe(401);
  });

  it("unknown invoice id returns 404 for an authenticated actor", async () => {
    const res = await fetch(`${lab.baseUrl}/api/invoices/invoice_ZZZ`, { headers: bearer(ALICE_TOKEN) });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INVOICE_NOT_FOUND");
  });
});
