/**
 * Issue #92 — P0 oracle consistency regression suite.
 *
 * Live evidence reconstructed from persisted rows (2026-11-08, scan
 * e39e3508 / attempt f9bc1955): a scan pinned to `lab-v1-vulnerable`
 * executed while the shared `target-lab` alias served `lab-v2-patched`.
 * The independent oracle returned `inconclusive` with legs pass/pass —
 * the CORRECT fail-closed outcome, not a mapping defect: the contract
 * matrix only applies when P0 preconditions hold.
 *
 * These tests pin the four lab/pin combinations end-to-end through the
 * REAL verifier (`adjudicateAttempt`), plus the tri-state persistence
 * contract: an `unknown` leg must persist null, never a fabricated false.
 */
import { describe, expect, it } from "vitest";
import { executeScanJob } from "./scan.js";
import { buildHarness } from "../adapters/testing/harness.js";
import { executedOutcome, makeScan } from "../adapters/testing/stubs.js";
import { createAttemptVerifier } from "../adapters/real.js";
import type { AttemptObservations, ObservedLeg } from "../adapters/ports.js";
import type { OrchestratorDeps } from "./deps.js";

const VULN = "lab-v1-vulnerable";
const PATCHED = "lab-v2-patched";

function leg(status: number, body: unknown, revisionEcho: string | null): ObservedLeg {
  return { status, bodyText: JSON.stringify(body), body, revisionEcho };
}

function metaBody(revision: string) {
  return {
    service: "highcastle-target-lab",
    revision,
    fixtureVersion: "1.0.0",
    fixtureSet: "alice-bob-invoices",
    fixtures: {
      invoices: [
        { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
        { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
      ],
    },
  };
}

const ALICE_INVOICE = {
  invoice: { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A", number: "INV-2026-0001" },
};
const BOB_INVOICE = {
  invoice: { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B", number: "INV-2026-0002" },
};
const DENIED = { error: { code: "INVOICE_NOT_FOUND", message: "No invoice is visible." } };

/** Six-leg observation set as the guest program would emit for `lab`. */
function observations(opts: {
  attemptId: string;
  /** Scan's pinned revision (expectedRevision passed to the oracle). */
  expectedRevision: string;
  /** Revision the lab actually reported on every leg. */
  labRevision: string;
  own?: ObservedLeg;
  cross?: ObservedLeg;
}): AttemptObservations {
  const lab = opts.labRevision;
  return {
    attemptId: opts.attemptId,
    expectedRevision: opts.expectedRevision,
    health: leg(200, { status: "ok", revision: lab }, lab),
    ready: leg(200, { status: "ready", revision: lab }, lab),
    meta: leg(200, metaBody(lab), lab),
    ownInvoice: opts.own ?? leg(200, ALICE_INVOICE, lab),
    crossInvoice: opts.cross ?? leg(404, DENIED, lab),
  };
}

function realVerifierDeps(h: ReturnType<typeof buildHarness>): OrchestratorDeps {
  return { ...h.deps, verifier: createAttemptVerifier() };
}

const P = (h: ReturnType<typeof buildHarness>) => ({
  workspaceId: h.scan.workspaceId,
  scanId: h.scan.id,
});

describe("issue #92 — expected vs observed verdict matrix", () => {
  it("vulnerable lab under vulnerable pin -> reproduced (legs t/f)", async () => {
    const h = buildHarness({
      sandboxOutcome: executedOutcome({
        attemptId: "a",
        observations: observations({
          attemptId: "a",
          expectedRevision: VULN,
          labRevision: VULN,
          cross: leg(200, BOB_INVOICE, VULN),
        }),
      }),
    });
    const result = await executeScanJob(realVerifierDeps(h), P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("reproduced");
    expect(attempt?.positiveControlPassed).toBe(true);
    expect(attempt?.negativeSecurityConditionMet).toBe(false);
    expect((await h.store.getScan(h.scan.workspaceId, h.scan.id))?.confirmedCount).toBe(1);
  });

  it("patched lab under patched pin -> not_reproduced (legs t/t) — replay-attempt shape", async () => {
    const h = buildHarness({
      scan: makeScan({ targetRevision: PATCHED }),
      sandboxOutcome: executedOutcome({
        attemptId: "a",
        observations: observations({
          attemptId: "a",
          expectedRevision: PATCHED,
          labRevision: PATCHED,
        }),
      }),
    });
    const result = await executeScanJob(realVerifierDeps(h), P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("not_reproduced");
    expect(attempt?.positiveControlPassed).toBe(true);
    expect(attempt?.negativeSecurityConditionMet).toBe(true);
  });

  it("LIVE f9bc1955: patched lab under vulnerable pin -> inconclusive, legs honestly t/t", async () => {
    // Exact persisted shape: pass/pass legs, revision mismatch, verdict
    // inconclusive — NOT not_reproduced. The oracle cannot say which
    // target it measured, so the matrix row does not apply.
    const h = buildHarness({
      sandboxOutcome: executedOutcome({
        attemptId: "a",
        observations: observations({
          attemptId: "a",
          expectedRevision: VULN,
          labRevision: PATCHED,
        }),
      }),
    });
    const result = await executeScanJob(realVerifierDeps(h), P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("inconclusive");
    expect(attempt?.positiveControlPassed).toBe(true);
    expect(attempt?.negativeSecurityConditionMet).toBe(true);
    expect(attempt?.verdictReasonCode).toContain("revision mismatch");
    expect(attempt?.verdictReasonCode).toContain("observed lab-v2-patched");
    expect(h.store.findings.size).toBe(0);
    expect(h.events.types(h.scan.id)).not.toContain("finding.confirmed");
  });

  it("vulnerable lab under patched pin -> inconclusive even with a leaked cross-read", async () => {
    // Inverse mismatch: Bob's invoice WAS returned (legs look like a
    // reproduction) but the lab does not match the pinned revision —
    // `reproduced` against an unidentified target is never recorded.
    const h = buildHarness({
      scan: makeScan({ targetRevision: PATCHED }),
      sandboxOutcome: executedOutcome({
        attemptId: "a",
        observations: observations({
          attemptId: "a",
          expectedRevision: PATCHED,
          labRevision: VULN,
          cross: leg(200, BOB_INVOICE, VULN),
        }),
      }),
    });
    const result = await executeScanJob(realVerifierDeps(h), P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("inconclusive");
    expect(attempt?.positiveControlPassed).toBe(true);
    expect(attempt?.negativeSecurityConditionMet).toBe(false);
    expect(h.store.findings.size).toBe(0);
  });
});

describe("issue #92 — tri-state leg persistence (unknown != false)", () => {
  it("persists null — not false — for an unobserved baseline leg", async () => {
    const h = buildHarness({
      sandboxOutcome: executedOutcome({
        attemptId: "a",
        observations: observations({
          attemptId: "a",
          expectedRevision: VULN,
          labRevision: VULN,
          own: leg(500, { error: { code: "INTERNAL" } }, VULN),
        }),
      }),
    });
    const result = await executeScanJob(realVerifierDeps(h), P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("inconclusive");
    expect(attempt?.positiveControlPassed).toBeNull();
    expect(attempt?.negativeSecurityConditionMet).toBe(true);
  });

  it("persists null — not false — for an ambiguous cross-account leg", async () => {
    const h = buildHarness({
      sandboxOutcome: executedOutcome({
        attemptId: "a",
        observations: observations({
          attemptId: "a",
          expectedRevision: VULN,
          labRevision: VULN,
          cross: leg(200, { ok: true }, VULN), // 200 without owner proof
        }),
      }),
    });
    const result = await executeScanJob(realVerifierDeps(h), P(h));
    expect(result.status).toBe("completed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.verifierVerdict).toBe("inconclusive");
    expect(attempt?.positiveControlPassed).toBe(true);
    expect(attempt?.negativeSecurityConditionMet).toBeNull();
  });
});

describe("issue #92 — sandbox precondition failures (live 08:00 window)", () => {
  it("controller precondition_failed -> attempt failed + scan sandbox_precondition", async () => {
    const h = buildHarness({
      sandboxOutcome: {
        kind: "precondition_failed",
        reason:
          "target image digest mismatch: pinned f097155d… but running lab " +
          "image is sha256:1499bf79… — refusing to launch",
      },
    });
    const result = await executeScanJob(realVerifierDeps(h), P(h));
    expect(result.status).toBe("failed");
    const [attempt] = await h.store.listAttempts(h.scan.workspaceId, h.scan.id);
    expect(attempt?.status).toBe("failed");
    // No verdict and no legs are minted for a run that never launched.
    expect(attempt?.verifierVerdict).toBeNull();
    expect(attempt?.positiveControlPassed).toBeNull();
    expect(attempt?.negativeSecurityConditionMet).toBeNull();
    const scan = await h.store.getScan(h.scan.workspaceId, h.scan.id);
    expect(scan?.status).toBe("failed");
    expect(scan?.failureCode).toBe("sandbox_precondition");
  });
});
