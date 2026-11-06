import { describe, expect, it } from "vitest";
import {
  VerificationVerdictSchema,
  evaluateAttemptVerdict,
  evaluateReplayVerdict,
} from "@highcastle/contracts";
import {
  adjudicateAttempt,
  adjudicateReplay,
  checkPreconditions,
  classifyBaseline,
  classifySecurityCheck,
} from "./oracle.js";
import type { BolaAttemptAdjudication, BolaAttemptInput, ObservedHttpResponse } from "./types.js";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function resp(
  status: number,
  body: unknown,
  revisionEcho: string | null = "lab-v1-vulnerable",
): ObservedHttpResponse {
  return { status, bodyText: JSON.stringify(body), body, revisionEcho };
}

function aliceInvoiceBody() {
  return {
    invoice: {
      id: "invoice_A",
      number: "INV-2026-0001",
      tenantId: "tenant_A",
      ownerId: "user_A",
    },
    meta: { revision: "lab-v1-vulnerable", requestId: "req-p1" },
  };
}

function bobInvoiceBody(revision: string) {
  return {
    invoice: {
      id: "invoice_B",
      number: "INV-2026-0002",
      tenantId: "tenant_B",
      ownerId: "user_B",
    },
    meta: { revision, requestId: "req-s1" },
  };
}

function deniedBody(revision: string, status: number) {
  return {
    error: { code: "INVOICE_NOT_FOUND", message: `No invoice is visible (${status}).` },
    meta: { revision, requestId: "req-s1" },
  };
}

function metaBody(revision: string) {
  return {
    service: "highcastle-target-lab",
    revision,
    fixtureVersion: "1.0.0",
    fixtureSet: "alice-bob-invoices",
    fixtures: {
      tenants: ["tenant_A", "tenant_B"],
      users: [
        { userId: "user_A", tenantId: "tenant_A", label: "alice" },
        { userId: "user_B", tenantId: "tenant_B", label: "bob" },
      ],
      invoices: [
        { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
        { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
      ],
    },
  };
}

function vulnerableInput(): BolaAttemptInput {
  const revision = "lab-v1-vulnerable";
  return {
    attemptId: ATTEMPT_ID,
    expectedRevision: revision,
    health: resp(200, { status: "ok", revision }, revision),
    ready: resp(200, { status: "ready", revision }, revision),
    meta: resp(200, metaBody(revision), revision),
    ownInvoice: resp(200, aliceInvoiceBody(), revision),
    crossInvoice: resp(200, bobInvoiceBody(revision), revision),
  };
}

function patchedInput(): BolaAttemptInput {
  const revision = "lab-v2-patched";
  return {
    attemptId: ATTEMPT_ID,
    expectedRevision: revision,
    health: resp(200, { status: "ok", revision }, revision),
    ready: resp(200, { status: "ready", revision }, revision),
    meta: resp(200, metaBody(revision), revision),
    ownInvoice: resp(
      200,
      {
        invoice: { ...aliceInvoiceBody().invoice },
        meta: { revision, requestId: "req-p1" },
      },
      revision,
    ),
    crossInvoice: resp(404, deniedBody(revision, 404), revision),
  };
}

describe("classifyBaseline (P1)", () => {
  it("passes on 200 with Alice's full invoice identity", () => {
    expect(classifyBaseline(vulnerableInput().ownInvoice).outcome).toBe("pass");
  });

  it("fails a denied own read (broken baseline, not ambiguous)", () => {
    expect(classifyBaseline(resp(404, deniedBody("lab-v1-vulnerable", 404))).outcome).toBe("fail");
    expect(classifyBaseline(resp(401, { error: { code: "UNAUTHENTICATED" } })).outcome).toBe(
      "fail",
    );
  });

  it("fails a 200 with mismatched identity and unknowns a 500", () => {
    const wrongOwner = resp(200, bobInvoiceBody("lab-v1-vulnerable"));
    expect(classifyBaseline(wrongOwner).outcome).toBe("fail");
    expect(classifyBaseline(resp(500, { error: { code: "INTERNAL" } })).outcome).toBe("unknown");
  });
});

describe("classifySecurityCheck (S1)", () => {
  it("fails open only on 200 with Bob's full protected identity", () => {
    expect(classifySecurityCheck(vulnerableInput().crossInvoice).outcome).toBe("fail");
  });

  it("passes on a clean 403/404 denial with no invoice data", () => {
    expect(classifySecurityCheck(patchedInput().crossInvoice).outcome).toBe("pass");
    expect(
      classifySecurityCheck(resp(403, deniedBody("lab-v2-patched", 403), "lab-v2-patched")).outcome,
    ).toBe("pass");
  });

  it("never credits HTTP 200 without owner proof (false-positive guard)", () => {
    expect(classifySecurityCheck(resp(200, { ok: true })).outcome).toBe("unknown");
    expect(classifySecurityCheck(resp(200, aliceInvoiceBody())).outcome).toBe("unknown");
    expect(
      classifySecurityCheck(
        resp(200, {
          invoice: { id: "invoice_B", ownerId: "user_A", tenantId: "tenant_A", number: "INV-X" },
        }),
      ).outcome,
    ).toBe("unknown");
  });

  it("treats a denial status that leaks invoice data as ambiguous", () => {
    const leaky = resp(404, {
      ...deniedBody("lab-v2-patched", 404),
      invoice: bobInvoiceBody("lab-v2-patched").invoice,
    });
    expect(classifySecurityCheck(leaky).outcome).toBe("unknown");
  });

  it("treats 401/5xx as ambiguous, never as an authorization denial", () => {
    expect(classifySecurityCheck(resp(401, { error: { code: "UNAUTHENTICATED" } })).outcome).toBe(
      "unknown",
    );
    expect(classifySecurityCheck(resp(500, {})).outcome).toBe("unknown");
  });
});

describe("adjudicateAttempt", () => {
  it("reproduces on the vulnerable observation", () => {
    const result = adjudicateAttempt(vulnerableInput());
    expect(result.baseline).toBe("pass");
    expect(result.securityCheck).toBe("fail");
    expect(result.preconditionsOk).toBe(true);
    expect(result.verdict).toBe("reproduced");
    expect(result.oracleVersion).toBe("bola-oracle-v1");
  });

  it("does not reproduce on the patched observation", () => {
    const result = adjudicateAttempt(patchedInput());
    expect(result.baseline).toBe("pass");
    expect(result.securityCheck).toBe("pass");
    expect(result.verdict).toBe("not_reproduced");
  });

  it("is inconclusive when the baseline is broken", () => {
    const input = vulnerableInput();
    input.ownInvoice = resp(500, { error: { code: "INTERNAL" } });
    const result = adjudicateAttempt(input);
    expect(result.baseline).toBe("unknown");
    expect(result.verdict).toBe("inconclusive");
  });

  it("forces inconclusive on revision mismatch even for clean denial legs", () => {
    const input = patchedInput();
    input.expectedRevision = "lab-v1-vulnerable";
    const result = adjudicateAttempt(input);
    expect(result.baseline).toBe("pass");
    expect(result.securityCheck).toBe("pass");
    expect(result.preconditionsOk).toBe(false);
    expect(result.verdict).toBe("inconclusive");
    expect(result.reasons.some((reason) => reason.includes("revision"))).toBe(true);
  });

  it("forces inconclusive on fixture version drift", () => {
    const input = vulnerableInput();
    input.meta = resp(
      200,
      { ...metaBody("lab-v1-vulnerable"), fixtureVersion: "9.9.9" },
      "lab-v1-vulnerable",
    );
    const result = adjudicateAttempt(input);
    expect(result.preconditionsOk).toBe(false);
    expect(result.verdict).toBe("inconclusive");
  });

  it("forces inconclusive when the trusted P2 manifest entry is missing", () => {
    const input = vulnerableInput();
    const body = metaBody("lab-v1-vulnerable");
    const manifest = {
      ...body,
      fixtures: { ...body.fixtures, invoices: [body.fixtures.invoices[0]] },
    };
    input.meta = resp(200, manifest, "lab-v1-vulnerable");
    expect(checkPreconditions(input).reasons).toContain(
      "P2 trusted fixture mismatch for invoice_B",
    );
    expect(adjudicateAttempt(input).verdict).toBe("inconclusive");
  });

  it("derives the verdict from the canonical contract matrix when grounded", () => {
    for (const input of [vulnerableInput(), patchedInput()]) {
      const result = adjudicateAttempt(input);
      expect(result.verdict).toBe(
        evaluateAttemptVerdict({
          baseline: result.baseline,
          securityCheck: result.securityCheck,
        }),
      );
    }
  });

  it("emits a contract-valid VerificationVerdict shape", () => {
    const result = adjudicateAttempt(vulnerableInput());
    expect(() =>
      VerificationVerdictSchema.parse({
        attemptId: result.attemptId,
        oracleVersion: result.oracleVersion,
        baseline: result.baseline,
        securityCheck: result.securityCheck,
        verdict: result.verdict,
      }),
    ).not.toThrow();
  });
});

describe("adjudicateReplay", () => {
  function adjudicationOf(input: BolaAttemptInput): BolaAttemptAdjudication {
    return adjudicateAttempt(input);
  }

  it("marks the patched run verified_fixed (legitimate access still works)", () => {
    const replay = adjudicateReplay(adjudicationOf(patchedInput()));
    expect(replay.replayVerdict).toBe("verified_fixed");
  });

  it("marks a still-reading run still_vulnerable", () => {
    const replay = adjudicateReplay(adjudicationOf(vulnerableInput()));
    expect(replay.replayVerdict).toBe("still_vulnerable");
  });

  it("marks denied-cross-account plus broken own access a regression", () => {
    const input = patchedInput();
    input.ownInvoice = resp(404, deniedBody("lab-v2-patched", 404), "lab-v2-patched");
    const replay = adjudicateReplay(adjudicationOf(input));
    expect(replay.replayVerdict).toBe("regression");
  });

  it("is inconclusive on ambiguous patched legs", () => {
    const input = patchedInput();
    input.crossInvoice = resp(500, {}, "lab-v2-patched");
    const replay = adjudicateReplay(adjudicationOf(input));
    expect(replay.replayVerdict).toBe("inconclusive");
  });

  it("matches the canonical replay matrix for every covered row", () => {
    const rows: BolaAttemptInput[] = [vulnerableInput(), patchedInput()];
    for (const input of rows) {
      const run = adjudicationOf(input);
      expect(adjudicateReplay(run).replayVerdict).toBe(
        evaluateReplayVerdict({
          legitimateRead: run.baseline,
          unauthorizedReadDenied: run.securityCheck,
          stillReadsCrossAccount: run.verdict === "reproduced",
        }),
      );
    }
  });
});
