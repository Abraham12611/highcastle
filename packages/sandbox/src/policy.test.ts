import { describe, expect, it } from "vitest";

import { StaticLabPolicyGate, LOCAL_POLICY_VERSION } from "./policy.ts";
import { makeRequest } from "./testkit/fakes.ts";

const gate = new StaticLabPolicyGate();

describe("StaticLabPolicyGate — H intersection", () => {
  it("allows a well-formed in-scope request", async () => {
    const decision = await gate.authorize(makeRequest());
    expect(decision.allowed).toBe(true);
    expect(decision.policyVersion).toBe(LOCAL_POLICY_VERSION);
  });

  it("denies a pack version other than the frozen manifest", async () => {
    const decision = await gate.authorize(makeRequest({ packVersion: "9.9.9" }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("packVersion");
  });

  it("denies request budgets above the pack manifest", async () => {
    const over = makeRequest();
    over.limits = { ...over.limits, maxRequests: 16 };
    const decision = await gate.authorize(over);
    expect(decision.allowed).toBe(false);
  });

  it("denies duration budgets above the pack manifest", async () => {
    const over = makeRequest();
    over.limits = { ...over.limits, maxDurationSeconds: 120 };
    const decision = await gate.authorize(over);
    expect(decision.allowed).toBe(false);
  });

  it("denies empty target image digest", async () => {
    const decision = await gate.authorize(makeRequest({ targetImageDigest: " " }));
    expect(decision.allowed).toBe(false);
  });
});
