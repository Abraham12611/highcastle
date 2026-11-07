import { describe, expect, it } from "vitest";
import { DEMO_PROJECT_ID, DEMO_SCANS_ENDPOINT, demoScanRequest } from "./constants";

describe("demo handoff payload", () => {
  it("targets the seeded demo project scans endpoint", () => {
    expect(DEMO_SCANS_ENDPOINT).toBe(`/api/v1/projects/${DEMO_PROJECT_ID}/scans`);
  });
  it("issues a bounded targeted_red_team request for the BOLA pack", () => {
    const body = demoScanRequest("demo-test-key");
    expect(body).toEqual({
      scanType: "targeted_red_team",
      testPackIds: ["bola-invoice-v1"],
      idempotencyKey: "demo-test-key",
    });
  });
});
