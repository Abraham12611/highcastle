/**
 * Probe structure tests. Whether a probe reports `denied` vs `breach` depends
 * on the environment it runs in — THAT is the point. Outside the sandbox we
 * assert only the protocol contract: real outcomes, real details, no
 * fabrication. The deny assertions live in the Docker integration suite.
 */

import { describe, expect, it } from "vitest";

import { runContainmentProbes } from "./probes.ts";

const VALID_OUTCOMES = new Set(["denied", "observed", "breach", "error", "skipped"]);

describe("containment probes (uncontainerized)", () => {
  it("every probe emits a real, bounded outcome with an operation", async () => {
    const results = await runContainmentProbes();
    expect(results.length).toBeGreaterThanOrEqual(8);
    for (const r of results) {
      expect(VALID_OUTCOMES.has(r.outcome)).toBe(true);
      expect(r.operation.length).toBeGreaterThan(0);
      expect(r.operation.length).toBeLessThanOrEqual(200);
      expect(r.detail.length).toBeGreaterThan(0);
      if (r.outcome === "denied") {
        expect(r.ruleId).not.toBeNull();
      }
    }
  });

  it("reports uid truthfully for the current environment", async () => {
    const results = await runContainmentProbes();
    const uid = results.find((r) => r.probe === "uid_nonroot");
    expect(uid).toBeDefined();
    // In dev we run as a normal user: observed. If a container ever runs as
    // root, this probe reports breach — which is the honest, desired signal.
    expect(["observed", "breach"]).toContain(uid!.outcome);
  });
});
