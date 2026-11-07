import { describe, expect, it } from "vitest";
import {
  DEMO_SESSION_ENDPOINT,
  assessmentContextEndpoint,
  createScanEndpoint,
  demoScanBody,
  selectApprovedTarget,
  type AssessmentContext,
} from "./constants";

const ctx: AssessmentContext = {
  project: { id: "p1", name: "Invoice demo", slug: "demo" },
  targets: [
    { environment: { id: "env-1", label: "attack twin", currentRevision: "lab-v1" },
      target: { id: "tgt-1" },
      scope: { id: "scope-1", allowedTestPackIds: ["bola-invoice-v1"] } },
    { environment: { id: "env-2", label: "patched", currentRevision: "lab-v2" },
      target: { id: "tgt-1" }, scope: null },
  ],
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
    const approved = selectApprovedTarget(ctx);
    expect(approved?.scope.id).toBe("scope-1");
    if (!approved) throw new Error("missing approved target");
    const body = demoScanBody(approved);
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
  it("does not submit a scan when the backend provides no approved scope", () => {
    expect(selectApprovedTarget({ ...ctx, targets: [{...ctx.targets[0]!, scope: null}] })).toBeNull();
    expect(selectApprovedTarget({ ...ctx, targets: [{...ctx.targets[0]!, scope: {id:"x",allowedTestPackIds:[]}}] })).toBeNull();
  });
});

  