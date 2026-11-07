import { describe, expect, it } from "vitest";
import { ModelProposalSchema } from "@highcastle/contracts";
import { VultrInferenceError } from "./errors.js";
import {
  createMockVultrClientForTests,
  DEFAULT_MOCK_MODEL,
} from "./mock.js";

const INPUT = {
  sanitizedSourceContext: "GET /api/invoices/:id reads by id; owner check unknown.",
  scopeSummary: "Owned synthetic lab only; pack bola-invoice-v1.",
};

const ALLOWED_ENV = { VITEST: "true", NODE_ENV: "development" };

describe("createMockVultrClientForTests", () => {
  it("refuses to exist outside an explicit test environment", () => {
    expect(() =>
      createMockVultrClientForTests({ kind: "valid" }, {}),
    ).toThrowError(VultrInferenceError);
    try {
      createMockVultrClientForTests({ kind: "valid" }, {});
      expect.unreachable();
    } catch (caught) {
      expect((caught as VultrInferenceError).code).toBe("mock_not_allowed");
    }
  });

  it("returns a schema-valid BOLA proposal by default", async () => {
    const mock = createMockVultrClientForTests({ kind: "valid" }, ALLOWED_ENV);
    expect(mock.isMockForTests).toBe(true);
    const result = await mock.generateHypothesis(INPUT);
    expect(result.validationStatus).toBe("valid");
    expect(() =>
      ModelProposalSchema.parse(result.proposal),
    ).not.toThrow();
    expect(result.metadata.provider).toBe("vultr");
    expect(result.metadata.model).toBe(DEFAULT_MOCK_MODEL);
  });

  it("replays invalid and error scenarios deterministically", async () => {
    const invalid = createMockVultrClientForTests(
      { kind: "invalid", rejectionCode: "unknown_pack" },
      ALLOWED_ENV,
    );
    const bad = await invalid.generateHypothesis(INPUT);
    expect(bad.proposal).toBeNull();
    expect(bad.rejectionCode).toBe("unknown_pack");
    expect(bad.metadata.outcome).toBe("policy_conflict");

    const failing = createMockVultrClientForTests(
      { kind: "error", code: "timeout" },
      ALLOWED_ENV,
    );
    await expect(failing.generateHypothesis(INPUT)).rejects.toMatchObject({
      code: "timeout",
    });
  });
});
