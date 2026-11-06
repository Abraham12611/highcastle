import { describe, expect, it } from "vitest";
import {
  CredentialRefSchema,
  SANDBOX_HARD_CAPS,
  SCOPE_HARD_CAPS,
  TEST_PACK_MANIFEST,
} from "@highcastle/contracts";
import {
  BOLA_MAX_DURATION_SECONDS,
  BOLA_MAX_REQUESTS,
  BOLA_ORACLE_VERSION,
  BOLA_PACK_ID,
  BOLA_PACK_MANIFEST,
  BOLA_PACK_VERSION,
  BOLA_STEP_IDS,
  assertBolaManifestInvariants,
} from "./manifest.js";
import { credentialRefFor } from "./fixtures.js";

describe("bola-invoice-v1 manifest", () => {
  it("adopts the canonical L03 contract manifest verbatim", () => {
    expect(BOLA_PACK_ID).toBe("bola-invoice-v1");
    expect(BOLA_PACK_VERSION).toBe("1.0.0");
    expect(BOLA_PACK_MANIFEST).toEqual(TEST_PACK_MANIFEST["bola-invoice-v1"]);
  });

  it("declares the exact pack contract from the test-pack specification", () => {
    expect(BOLA_PACK_MANIFEST).toMatchObject({
      version: "1.0.0",
      targetKind: "owned_demo_lab",
      category: "broken_object_authorization",
      requiredRoles: ["alice", "bob"],
      permittedMethods: ["GET"],
      maxRequests: 8,
      maxDurationSeconds: 30,
      oracleVersion: "bola-oracle-v1",
      mutating: false,
    });
    expect(BOLA_ORACLE_VERSION).toBe("bola-oracle-v1");
  });

  it("budgets the full versioned step sequence inside pack and lane caps", () => {
    expect(BOLA_STEP_IDS).toHaveLength(7);
    expect(BOLA_MAX_REQUESTS).toBeGreaterThanOrEqual(BOLA_STEP_IDS.length);
    expect(BOLA_MAX_REQUESTS).toBeLessThanOrEqual(SANDBOX_HARD_CAPS.maxRequests);
    expect(BOLA_MAX_REQUESTS).toBeLessThanOrEqual(SCOPE_HARD_CAPS.maxRequests);
    expect(BOLA_MAX_DURATION_SECONDS).toBeLessThanOrEqual(SANDBOX_HARD_CAPS.maxDurationSeconds);
    expect(BOLA_MAX_DURATION_SECONDS).toBeLessThanOrEqual(SCOPE_HARD_CAPS.maxDurationSeconds);
  });

  it("passes the structural safety invariants (non-mutating, GET-only, bounded)", () => {
    expect(() => assertBolaManifestInvariants()).not.toThrow();
  });

  it("names opaque credential refs that satisfy the sandbox contract", () => {
    for (const role of ["alice", "bob"] as const) {
      const ref = credentialRefFor(role);
      expect(() => CredentialRefSchema.parse(ref)).not.toThrow();
      expect(ref).not.toContain("lab-token");
    }
    expect(credentialRefFor("alice")).toBe("ref:synthetic:alice");
  });
});
