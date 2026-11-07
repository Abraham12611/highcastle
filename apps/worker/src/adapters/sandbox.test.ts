/**
 * observationsFromRun — strict mapping of runner ParsedObservation legs to
 * the L15 oracle's AttemptObservations. Missing, inconsistent or duplicate
 * legs must yield null (→ inconclusive), never a partial-evidence verdict.
 */
import { describe, expect, it } from "vitest";
import { observationsFromRun } from "./sandbox.js";
import type { ParsedObservation } from "@highcastle/sandbox";

const REV = "lab-v1-vulnerable";
const H = { revisionEcho: REV, at: new Date().toISOString() };

function leg(step: string, status = 200, body: unknown = { ok: true }): ParsedObservation {
  return { step, status, body, revisionEcho: REV, at: H.at };
}

const FULL: ParsedObservation[] = [
  leg("health"),
  leg("ready"),
  leg("meta", 200, { revision: REV, fixtureVersion: "1.0.0", fixtureSet: "alice-bob-invoices" }),
  leg("whoami", 200, { actor: { userId: "user_A", tenantId: "tenant_A", label: "alice" } }),
  leg("own_invoice", 200, { invoice: { id: "invoice_A" } }),
  leg("cross_invoice", 403, { error: { code: "forbidden" } }),
];

describe("observationsFromRun", () => {
  it("maps a complete six-leg observation set", () => {
    const obs = observationsFromRun("att-1", REV, FULL);
    expect(obs).not.toBeNull();
    expect(obs?.health.status).toBe(200);
    expect(obs?.ownInvoice.status).toBe(200);
    expect(obs?.crossInvoice.status).toBe(403);
    expect(obs?.attemptId).toBe("att-1");
    expect(obs?.expectedRevision).toBe(REV);
  });
  it("returns null on a missing leg", () => {
    expect(observationsFromRun("a", REV, FULL.slice(0, 5))).toBeNull();
  });
  it("returns null on a duplicate leg", () => {
    expect(observationsFromRun("a", REV, [...FULL, leg("meta")])).toBeNull();
  });
  it("returns null on an unexpected step", () => {
    expect(observationsFromRun("a", REV, [...FULL, leg("bogus")])).toBeNull();
  });
  it("returns null on empty/absent observations", () => {
    expect(observationsFromRun("a", REV, [])).toBeNull();
    expect(observationsFromRun("a", REV, null)).toBeNull();
    expect(observationsFromRun("a", REV, undefined)).toBeNull();
  });
  it("returns null on a malformed leg (non-number status)", () => {
    const bad = FULL.map((o) => (o.step === "meta" ? { ...o, status: "200" as never } : o));
    expect(observationsFromRun("a", REV, bad)).toBeNull();
  });
});
