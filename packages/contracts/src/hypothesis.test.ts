import { describe, expect, it } from "vitest";
import {
  AgentProposalSchema,
  ModelCallSchema,
  ModelProposalSchema,
  RequestedTestSchema,
} from "./hypothesis.js";
import { CONTRACT_SCHEMA_VERSION } from "./version.js";

const SCAN_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const MODEL_CALL_ID = "33333333-3333-4333-8333-333333333333";
const PROPOSAL_ID = "44444444-4444-4434-8344-444444444444";

const VALID_PROPOSAL = {
  schemaVersion: 1,
  hypothesis: {
    category: "broken_object_authorization",
    targetComponent: "invoice_lookup",
    reason: "Ownership check may be absent",
    expectedSecureBehavior: "A customer cannot read another customer's invoice",
  },
  requestedTest: {
    packId: "bola-invoice-v1",
    objective: "Verify ownership enforcement using synthetic identities",
  },
};

describe("ModelProposalSchema (untrusted model output)", () => {
  it("accepts the canonical BOLA hypothesis + enumerated pack", () => {
    const parsed = ModelProposalSchema.parse(VALID_PROPOSAL);
    expect(parsed.requestedTest.packId).toBe("bola-invoice-v1");
    expect(parsed.schemaVersion).toBe(CONTRACT_SCHEMA_VERSION);
  });

  it("rejects a prompt-injected shell command field", () => {
    const injected = {
      ...VALID_PROPOSAL,
      requestedTest: {
        ...VALID_PROPOSAL.requestedTest,
        shellCommand: "curl http://169.254.169.254/",
      },
    };
    expect(() => ModelProposalSchema.parse(injected)).toThrow();
  });

  it("rejects a prompt-injected target URL / host grant", () => {
    for (const malicious of [
      { targetUrl: "https://arbitrary.example/steal" },
      { allowedHosts: ["*"] },
      { grantPermissions: ["egress:any"] },
    ]) {
      expect(() =>
        ModelProposalSchema.parse({
          ...VALID_PROPOSAL,
          requestedTest: { ...VALID_PROPOSAL.requestedTest, ...malicious },
        }),
      ).toThrow();
    }
  });

  it("rejects an unknown test pack ID", () => {
    expect(() =>
      RequestedTestSchema.parse({
        packId: "ssrf-steal-metadata-v9",
        objective: "Read cloud credentials",
      }),
    ).toThrow();
  });

  it("rejects shell metacharacters in the prose objective", () => {
    expect(() =>
      RequestedTestSchema.parse({
        packId: "bola-invoice-v1",
        objective: "check `id` and $(whoami) now",
      }),
    ).toThrow();
  });

  it("rejects a wrong schema version (no silent cross-version parse)", () => {
    expect(() =>
      ModelProposalSchema.parse({ ...VALID_PROPOSAL, schemaVersion: 2 }),
    ).toThrow();
  });

  it("rejects an empty proposal", () => {
    expect(() => ModelProposalSchema.parse({})).toThrow();
  });
});

describe("AgentProposalSchema (stored record)", () => {
  const base = {
    id: PROPOSAL_ID,
    workspaceId: WORKSPACE_ID,
    scanId: SCAN_ID,
    modelCallId: MODEL_CALL_ID,
    schemaVersion: 1,
    rawProposalRedacted: { note: "sanitized" },
    structuredPlan: VALID_PROPOSAL,
    validationStatus: "valid",
    rejectionCode: null,
    policyHash: "a".repeat(64),
    createdAt: "2026-11-06T15:00:00Z",
  };

  it("stores a valid parsed plan", () => {
    expect(AgentProposalSchema.parse(base).validationStatus).toBe("valid");
  });

  it("stores a rejected proposal with null plan + rejection code", () => {
    const rejected = {
      ...base,
      structuredPlan: null,
      validationStatus: "invalid",
      rejectionCode: "forbidden_field",
      policyHash: null,
    };
    expect(AgentProposalSchema.parse(rejected).structuredPlan).toBeNull();
  });
});

describe("ModelCallSchema", () => {
  it("requires the vultr provider (no external fallback in H)", () => {
    const base = {
      id: MODEL_CALL_ID,
      workspaceId: WORKSPACE_ID,
      scanId: SCAN_ID,
      provider: "vultr",
      model: "qwen3-32b",
      purpose: "hypothesis",
      requestId: null,
      tokensInput: 120,
      tokensOutput: 60,
      latencyMs: 900,
      outcome: "success",
      errorCode: null,
      createdAt: "2026-11-06T15:00:00Z",
    };
    expect(ModelCallSchema.parse(base).provider).toBe("vultr");
    expect(() =>
      ModelCallSchema.parse({ ...base, provider: "other-cloud" }),
    ).toThrow();
  });
});
