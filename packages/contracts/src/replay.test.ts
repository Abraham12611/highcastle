import { describe, expect, it } from "vitest";
import {
  ReplayRequestSchema,
  VerificationVerdictSchema,
  buildVerificationVerdict,
  evaluateAttemptVerdict,
  evaluateReplayVerdict,
} from "./replay.js";
import { AttemptIdSchema } from "./ids.js";

const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
const ENV_ID = "88888888-8888-4888-8888-888888888888";
const SCOPE_ID = "99999999-9999-4999-8999-999999999999";

describe("evaluateAttemptVerdict (BOLA oracle matrix)", () => {
  const cases = [
    {
      name: "own access + cross-account data returned",
      observation: { baseline: "pass", securityCheck: "fail" },
      expected: "reproduced",
    },
    {
      name: "own access + cross-account denied",
      observation: { baseline: "pass", securityCheck: "pass" },
      expected: "not_reproduced",
    },
    {
      name: "baseline broken",
      observation: { baseline: "fail", securityCheck: "fail" },
      expected: "inconclusive",
    },
    {
      name: "ambiguous cross-account response",
      observation: { baseline: "pass", securityCheck: "unknown" },
      expected: "inconclusive",
    },
    {
      name: "unknown baseline",
      observation: { baseline: "unknown", securityCheck: "pass" },
      expected: "inconclusive",
    },
  ] as const;

  for (const c of cases) {
    it(c.name, () => {
      expect(evaluateAttemptVerdict({ ...c.observation })).toBe(c.expected);
    });
  }

  it("round-trips through the verdict schema", () => {
    const verdict = buildVerificationVerdict(AttemptIdSchema.parse(ATTEMPT_ID), "bola-oracle-v1", {
      baseline: "pass",
      securityCheck: "fail",
    });
    expect(VerificationVerdictSchema.parse(verdict).verdict).toBe("reproduced");
  });
});

describe("evaluateReplayVerdict (fix-proof matrix)", () => {
  const cases = [
    {
      name: "still reads cross-account on patch",
      observation: {
        legitimateRead: "pass",
        unauthorizedReadDenied: "fail",
        stillReadsCrossAccount: true,
      },
      expected: "still_vulnerable",
    },
    {
      name: "denied + own read works",
      observation: {
        legitimateRead: "pass",
        unauthorizedReadDenied: "pass",
        stillReadsCrossAccount: false,
      },
      expected: "verified_fixed",
    },
    {
      name: "denied but own read also broken",
      observation: {
        legitimateRead: "fail",
        unauthorizedReadDenied: "pass",
        stillReadsCrossAccount: false,
      },
      expected: "regression",
    },
    {
      name: "ambiguous legs",
      observation: {
        legitimateRead: "unknown",
        unauthorizedReadDenied: "pass",
        stillReadsCrossAccount: false,
      },
      expected: "inconclusive",
    },
  ] as const;

  for (const c of cases) {
    it(c.name, () => {
      expect(evaluateReplayVerdict({ ...c.observation })).toBe(c.expected);
    });
  }
});

describe("ReplayRequestSchema (client cannot set the verdict)", () => {
  it("accepts a replay pinned to a patched revision", () => {
    const parsed = ReplayRequestSchema.parse({
      originalAttemptId: ATTEMPT_ID,
      patchedEnvironmentId: ENV_ID,
      patchedRevision: "lab-v2-patched",
      authorizationScopeId: SCOPE_ID,
    });
    expect(parsed.patchedRevision).toBe("lab-v2-patched");
  });

  it("rejects a client-supplied verdict or oracle claim", () => {
    for (const malicious of [
      { verdict: "verified_fixed" },
      { oracleVerdict: "reproduced" },
      { forceFixed: true },
    ]) {
      expect(() =>
        ReplayRequestSchema.parse({
          originalAttemptId: ATTEMPT_ID,
          patchedEnvironmentId: ENV_ID,
          patchedRevision: "lab-v2-patched",
          authorizationScopeId: SCOPE_ID,
          ...malicious,
        }),
      ).toThrow();
    }
  });
});
