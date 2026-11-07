import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  SandboxResultSchema,
  VerificationVerdictSchema,
  buildVerificationVerdict,
} from "@highcastle/contracts";
import { adjudicateReplay } from "./oracle.js";
import { generateAttemptNonce, runBolaPack, toSandboxResult } from "./runner.js";
import { STUB_ALICE_TOKEN, startRedirector, startStubLab, type StubLab } from "./test/stubLab.js";

const labs: StubLab[] = [];
afterEach(async () => {
  while (labs.length > 0) {
    await labs.pop()?.close();
  }
});

async function track(options: Parameters<typeof startStubLab>[0]): Promise<StubLab> {
  const lab = await startStubLab(options);
  labs.push(lab);
  return lab;
}

async function trackRedirector(targetBaseUrl: string): Promise<StubLab> {
  const redirector = await startRedirector(targetBaseUrl);
  labs.push(redirector);
  return redirector;
}

describe("runBolaPack wire execution", () => {
  it("reproduces cross-account access on the vulnerable revision", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });

    expect(run.setupOk).toBe(true);
    expect(run.budgetExceeded).toBe(false);
    expect(run.requestCount).toBe(7);
    expect(run.requestCount).toBeLessThanOrEqual(8);
    expect(run.adjudication.baseline).toBe("pass");
    expect(run.adjudication.securityCheck).toBe("fail");
    expect(run.adjudication.verdict).toBe("reproduced");
    expect(run.observedRevision).toBe("lab-v1-vulnerable");
    expect(run.observedFixtureVersion).toBe("1.0.0");
    expect(run.crossEvidence).toMatchObject({
      id: "invoice_B",
      ownerId: "user_B",
      tenantId: "tenant_B",
    });
    expect(run.ownEvidence).toMatchObject({
      id: "invoice_A",
      ownerId: "user_A",
      tenantId: "tenant_A",
    });
    // Same versioned pack, seven ordered steps incl. setup prerequisites.
    expect(run.exchanges.map((exchange) => exchange.path)).toEqual([
      "/health",
      "/ready",
      "/api/meta",
      "/api/auth/login",
      "/api/auth/whoami",
      "/api/invoices/invoice_A",
      "/api/invoices/invoice_B",
    ]);
  });

  it("does not reproduce on the patched revision (denied + baseline works)", async () => {
    const lab = await track({ revision: "lab-v2-patched", behavior: "patched" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v2-patched",
    });

    expect(run.setupOk).toBe(true);
    expect(run.adjudication.baseline).toBe("pass");
    expect(run.adjudication.securityCheck).toBe("pass");
    expect(run.adjudication.verdict).toBe("not_reproduced");
    expect(run.crossEvidence).toBeNull();
  });

  it("supports bearer auth mode on the same versioned pack", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
      authMode: "bearer",
    });
    expect(run.setupOk).toBe(true);
    expect(run.adjudication.verdict).toBe("reproduced");
  });

  it("is inconclusive when the baseline target is broken (P1 500)", async () => {
    const lab = await track({
      revision: "lab-v1-vulnerable",
      behavior: "vulnerable",
      corruption: "own-500",
    });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(run.adjudication.verdict).toBe("inconclusive");
    expect(run.adjudication.baseline).toBe("unknown");
  });

  it("is inconclusive when the lab is unreachable (baseline down)", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const deadUrl = lab.baseUrl;
    await labs.pop()?.close();
    const run = await runBolaPack({
      baseUrl: deadUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
      perRequestTimeoutMs: 500,
    });
    expect(run.setupOk).toBe(false);
    expect(run.adjudication.verdict).toBe("inconclusive");
    expect(run.adjudication.preconditionsOk).toBe(false);
  });

  it("is inconclusive on revision mismatch (wrong pinned target)", async () => {
    const lab = await track({ revision: "lab-v2-patched", behavior: "patched" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(run.adjudication.preconditionsOk).toBe(false);
    expect(run.adjudication.verdict).toBe("inconclusive");
  });

  it("is inconclusive on fixture drift and failed login", async () => {
    const drifted = await track({
      revision: "lab-v1-vulnerable",
      behavior: "vulnerable",
      corruption: "meta-drift",
    });
    const driftedRun = await runBolaPack({
      baseUrl: drifted.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(driftedRun.adjudication.verdict).toBe("inconclusive");

    const locked = await track({
      revision: "lab-v1-vulnerable",
      behavior: "vulnerable",
      corruption: "login-401",
    });
    const lockedRun = await runBolaPack({
      baseUrl: locked.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(lockedRun.setupOk).toBe(false);
    expect(lockedRun.adjudication.verdict).toBe("inconclusive");
  });

  it("enforces the request budget and stays inconclusive when starved", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
      maxRequests: 4,
    });
    expect(run.budgetExceeded).toBe(true);
    expect(run.requestCount).toBeLessThanOrEqual(4);
    expect(run.adjudication.verdict).toBe("inconclusive");
  });

  it("fails closed on redirects instead of following them", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const redirector = await trackRedirector(lab.baseUrl);
    const run = await runBolaPack({
      baseUrl: redirector.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    // Every step hit the redirector and stopped there: the real lab behind
    // the 302 was never touched, no cross-account data was recorded, and the
    // run is inconclusive rather than graded on a stranger's responses.
    expect(redirector.requestsSeen).toBeGreaterThan(0);
    expect(lab.requestsSeen).toBe(0);
    expect(run.setupOk).toBe(false);
    expect(run.crossEvidence).toBeNull();
    expect(run.adjudication.preconditionsOk).toBe(false);
    expect(run.adjudication.verdict).toBe("inconclusive");
    expect(adjudicateReplay(run.adjudication).replayVerdict).toBe("inconclusive");
  });

  it("rejects unsafe invocation shapes fail-closed", async () => {
    await expect(
      runBolaPack({
        baseUrl: "ftp://example.test/lab",
        aliceCredential: STUB_ALICE_TOKEN,
        expectedRevision: "lab-v1-vulnerable",
      }),
    ).rejects.toThrow();
    await expect(
      runBolaPack({
        baseUrl: "http://user:pass@127.0.0.1:9/",
        aliceCredential: STUB_ALICE_TOKEN,
        expectedRevision: "lab-v1-vulnerable",
      }),
    ).rejects.toThrow();
    await expect(
      runBolaPack({
        baseUrl: "http://127.0.0.1:9/",
        aliceCredential: "",
        expectedRevision: "lab-v1-vulnerable",
      }),
    ).rejects.toThrow();
    await expect(
      runBolaPack({
        baseUrl: "http://127.0.0.1:9/",
        aliceCredential: STUB_ALICE_TOKEN,
        expectedRevision: "lab-v1-vulnerable",
        maxRequests: 99,
      }),
    ).rejects.toThrow();
  });

  it("records no secrets anywhere in the run evidence", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain(STUB_ALICE_TOKEN);
    expect(serialized).not.toContain("lab-session-user_A");
    expect(serialized).not.toContain("Bearer ");
    for (const exchange of run.exchanges) {
      expect(exchange.bodyExcerptRedacted.length).toBeLessThanOrEqual(2001);
      expect(exchange.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("emits a contract-valid VerificationVerdict matching the canonical builder", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(() => VerificationVerdictSchema.parse(run.verificationVerdict)).not.toThrow();
    expect(run.verificationVerdict).toEqual(
      buildVerificationVerdict(run.attemptId, "bola-oracle-v1", {
        baseline: run.adjudication.baseline,
        securityCheck: run.adjudication.securityCheck,
      }),
    );
  });
});

describe("replay on the patched target", () => {
  it("verifies the fix: same pack, denied cross-account read, working baseline", async () => {
    const lab = await track({ revision: "lab-v2-patched", behavior: "patched" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v2-patched",
    });
    expect(adjudicateReplay(run.adjudication).replayVerdict).toBe("verified_fixed");
  });

  it("still flags a vulnerable replay target as still_vulnerable", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(adjudicateReplay(run.adjudication).replayVerdict).toBe("still_vulnerable");
  });
});

describe("toSandboxResult controller evidence", () => {
  it("normalizes a vulnerable run into a contract-valid SandboxResult", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    const result = toSandboxResult(run, {
      runnerId: randomUUID(),
      nonce: generateAttemptNonce(),
    });
    expect(() => SandboxResultSchema.parse(result)).not.toThrow();
    expect(result.status).toBe("completed");
    expect(result.baselineAssertion.passed).toBe(true);
    expect(result.negativeAssertion.passed).toBe(false);
    expect(result.observedFixtureOwner).toBe("bob");
    // Contract exchanges are GET-only: the setup login POST stays in pack
    // evidence but never enters the sandbox exchange record.
    expect(result.exchanges.every((exchange) => exchange.method === "GET")).toBe(true);
    expect(result.exchanges).toHaveLength(6);
    expect(JSON.stringify(result)).not.toContain(STUB_ALICE_TOKEN);
  });

  it("normalizes a patched run with a passing negative assertion", async () => {
    const lab = await track({ revision: "lab-v2-patched", behavior: "patched" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v2-patched",
    });
    const result = toSandboxResult(run, {
      runnerId: randomUUID(),
      nonce: generateAttemptNonce(),
    });
    expect(() => SandboxResultSchema.parse(result)).not.toThrow();
    expect(result.baselineAssertion.passed).toBe(true);
    expect(result.negativeAssertion.passed).toBe(true);
    expect(result.observedFixtureOwner).toBe("alice");
  });

  it("marks budget-starved runs timed out, never completed", async () => {
    const lab = await track({ revision: "lab-v1-vulnerable", behavior: "vulnerable" });
    const run = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
      maxRequests: 2,
    });
    const result = toSandboxResult(run, {
      runnerId: randomUUID(),
      nonce: generateAttemptNonce(),
    });
    expect(() => SandboxResultSchema.parse(result)).not.toThrow();
    expect(result.status).toBe("timeout");
    expect(result.baselineAssertion.passed).toBe(false);
  });
});
