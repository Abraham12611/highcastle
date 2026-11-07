import { describe, expect, it } from "vitest";
import {
  attemptVerdictExplainer,
  buildComparison,
  buildFixInstructions,
  buildLiveComparison,
  canDisplayVerifiedFixed,
  invariantCopy,
  replayForDisplay,
  verdictExplainer,
} from "./view-model";
import type { AttemptRecord, FindingDetail, ReplayRecord } from "./types";

function leg(
  legName: "P1" | "S1",
  path: string,
  status: number,
  identity: { id: string; ownerId: string; tenantId: string } | null,
) {
  return {
    leg: legName,
    method: "GET",
    path,
    status,
    bodyHash: "a".repeat(64),
    excerptRedacted: "{}",
    identity,
  };
}

const ALICE = { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" };
const BOB = { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" };

function attempt(targetRevision: string, crossStatus: number): AttemptRecord {
  return {
    attemptId: "22222222-2222-4222-8222-222222222222",
    scanId: "demo-scan-1",
    packId: "bola-invoice-v1",
    packVersion: "1.0.0",
    oracleVersion: "bola-oracle-v1",
    targetRevision,
    fixtureVersion: "1.0.0",
    baseline: leg("P1", "/api/invoices/invoice_A", 200, ALICE),
    crossAccount: leg(
      "S1",
      "/api/invoices/invoice_B",
      crossStatus,
      crossStatus === 200 ? BOB : null,
    ),
    verdict: crossStatus === 200 ? "reproduced" : "not_reproduced",
    verdictReasons: [],
  };
}

describe("verified-fixed display guard", () => {
  it("shows the badge only for a server-stated verified_fixed", () => {
    expect(canDisplayVerifiedFixed("verified_fixed")).toBe(true);
    expect(canDisplayVerifiedFixed("still_vulnerable")).toBe(false);
    expect(canDisplayVerifiedFixed("regression")).toBe(false);
    expect(canDisplayVerifiedFixed("inconclusive")).toBe(false);
    expect(canDisplayVerifiedFixed(null)).toBe(false);
    expect(canDisplayVerifiedFixed(undefined)).toBe(false);
  });

  it("never upgrades other replay states in the display model", () => {
    for (const verdict of ["still_vulnerable", "regression", "inconclusive"] as const) {
      const replay: ReplayRecord = {
        replayId: "r1",
        originalAttemptId: "a1",
        replayAttemptId: "a2",
        packVersion: "1.0.0",
        originalRevision: "lab-v1-vulnerable",
        patchedRevision: "lab-v2-patched",
        originalVerdict: "reproduced",
        replayAttemptVerdict: "not_reproduced",
        verdict,
        completedAt: null,
        assertions: null,
      };
      expect(replayForDisplay(replay).showVerified).toBe(false);
    }
  });
});

describe("verdict and invariant copy", () => {
  it("uses the exact product copy for every replay verdict", () => {
    expect(verdictExplainer("verified_fixed")).toContain("no longer reproduces");
    expect(verdictExplainer("still_vulnerable")).toContain("still possible");
    expect(verdictExplainer("regression")).toContain("legitimate workflow also broke");
    expect(verdictExplainer("inconclusive")).toContain("couldn't verify");
  });

  it("explains the attempt in builder and developer language", () => {
    expect(attemptVerdictExplainer("reproduced", "builder")).toContain(
      "test customer could read another test customer's invoice",
    );
    expect(attemptVerdictExplainer("reproduced", "developer")).toContain(
      "broken object-level authorization",
    );
    expect(attemptVerdictExplainer("inconclusive", "builder")).toContain("did not establish");
  });

  it("states the broken invariant per mode", () => {
    const builder = invariantCopy("builder");
    const developer = invariantCopy("developer");
    expect(builder.body).toContain("only ever see their own invoices");
    expect(developer.body).toContain("CWE-639");
    expect(builder.body).not.toBe(developer.body);
  });
});

describe("fix instructions", () => {
  function detail(): FindingDetail {
    return {
      finding: {
        id: "f1",
        title: "Cross-account invoice read (BOLA)",
        category: "broken_object_authorization",
        severity: "high",
        confidence: "confirmed_by_execution",
        remediationStatus: "open",
        firstSeenAt: "2026-11-06T12:00:04.000Z",
        lastSeenAt: "2026-11-06T12:00:04.000Z",
        summary: "Alice read Bob's invoice.",
        stableFingerprint: "bola:invoice_lookup:owner_check",
      },
      attempt: attempt("lab-v1-vulnerable", 200),
      fixGuidance: {
        rootCause: "Missing ownership check.",
        smallestFix: "Scope the lookup.",
        requiredInvariants: ["Scope every read to the actor tenant."],
        testGuidance: "Replay the pack.",
        provenance: "local",
      },
      replay: null,
      patchedAttempt: null,
      replayDefaults: {
        patchedEnvironmentId: "env",
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: "scope",
      },
      source: { kind: "demo", note: "demo" },
    };
  }

  it("assembles the exact copyable text from evidence", () => {
    const d = detail();
    if (d.attempt === null || d.fixGuidance === null) throw new Error("demo detail incomplete");
    const text = buildFixInstructions({
      title: d.finding.title,
      fingerprint: d.finding.stableFingerprint,
      attempt: d.attempt,
      guidance: d.fixGuidance,
    });
    expect(text.title).toBe("Copy fix instructions");
    expect(text.body).toContain("bola:invoice_lookup:owner_check");
    expect(text.body).toContain("Scope every read to the actor tenant.");
    expect(text.body).toContain("22222222-2222-4222-8222-222222222222");
    expect(text.body).toContain("bola-invoice-v1 v1.0.0");
    expect(text.body).toContain("lab-v1-vulnerable");
  });
});

describe("before/after comparison", () => {
  it("marks the unauthorized read as a failure and legitimate reads as allowed", () => {
    const comparison = buildComparison(
      attempt("lab-v1-vulnerable", 200),
      attempt("lab-v2-patched", 404),
    );
    expect(comparison.before.label).toContain("lab-v1-vulnerable");
    expect(comparison.after.label).toContain("lab-v2-patched");
    const beforeCross = comparison.before.rows[1];
    expect(beforeCross?.result).toBe("fail");
    expect(beforeCross?.observed).toContain("user_B");
    const beforeOwn = comparison.before.rows[0];
    expect(beforeOwn?.result).toBe("allowed");
    const afterCross = comparison.after.rows[1];
    expect(afterCross?.result).toBe("denied");
    expect(afterCross?.observed).toContain("404");
  });

  it("renders ambiguous legs as unknown, never as proof", () => {
    const comparison = buildComparison(
      attempt("lab-v1-vulnerable", 200),
      attempt("lab-v2-patched", 500),
    );
    expect(comparison.after.rows[1]?.result).toBe("unknown");
  });
});

describe("buildLiveComparison", () => {
  it("renders server-stated assertions without inventing evidence", () => {
    const comparison = buildLiveComparison(attempt("lab-v1-vulnerable", 200), {
      label: "After · lab-v2-patched (patched)",
      environment: "fixture 1.0.0",
      summary: "replay r1",
      positivePassed: true,
      negativeDenied: true,
    });
    expect(comparison.after.rows[0]?.result).toBe("allowed");
    expect(comparison.after.rows[1]?.result).toBe("denied");
    expect(comparison.after.rows[1]?.observed).toContain("server assertion");
  });

  it("renders failed and missing server assertions honestly", () => {
    const failed = buildLiveComparison(attempt("lab-v1-vulnerable", 200), {
      label: "After",
      environment: "fixture 1.0.0",
      summary: "replay r1",
      positivePassed: false,
      negativeDenied: false,
    });
    expect(failed.after.rows[0]?.result).toBe("fail");
    expect(failed.after.rows[1]?.result).toBe("fail");
    const missing = buildLiveComparison(attempt("lab-v1-vulnerable", 200), {
      label: "After",
      environment: "fixture 1.0.0",
      summary: "replay r1",
      positivePassed: null,
      negativeDenied: null,
    });
    expect(missing.after.rows[0]?.result).toBe("unknown");
    expect(missing.after.rows[1]?.result).toBe("unknown");
  });
});
