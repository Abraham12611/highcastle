import { describe, expect, it } from "vitest";
import {
  DEMO_SESSION_ENDPOINT,
  assessmentContextEndpoint,
  createScanEndpoint,
  demoScanBody,
  type AssessmentContext,
} from "./constants";

const ctx: AssessmentContext = {
  environment: { id: "env-1", label: "attack twin", currentRevision: "lab-v1" },
  target: { id: "tgt-1" },
  scope: { id: "scope-1", status: "active" },
};

describe("demo handoff request shape", () => {
  it("posts to the server-issued project scans endpoint", () => {
    expect(createScanEndpoint("p1")).toBe("/api/v1/projects/p1/scans");
    expect(assessmentContextEndpoint("p1")).toBe(
      "/api/v1/projects/p1/assessment-context",
    );
    expect(DEMO_SESSION_ENDPOINT).toBe("/api/auth/demo");
  });
  it("matches the strict CreateScanRequestSchema fields", () => {
    const body = demoScanBody(ctx);
    expect(body).toEqual({
      type: "targeted_red_team",
      environmentId: "env-1",
      targetId: "tgt-1",
      authorizationScopeId: "scope-1",
      testPackIds: ["bola-invoice-v1"],
    });
    // no idempotencyKey / scanType / hosts in the body — contract rejects them
    expect("idempotencyKey" in body).toBe(false);
    expect("scanType" in body).toBe(false);
  });
});
