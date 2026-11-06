import { describe, expect, it } from "vitest";
import { ModelProposalSchema } from "@highcastle/contracts";
import { parseModelProposal, redactForStorage } from "./validate.js";

const VALID_CONTENT = JSON.stringify({
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
});

describe("parseModelProposal", () => {
  it("accepts the canonical BOLA hypothesis for the allowed pack", () => {
    const result = parseModelProposal(VALID_CONTENT);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.proposal.requestedTest.packId).toBe("bola-invoice-v1");
      expect(() => ModelProposalSchema.parse(result.proposal)).not.toThrow();
    }
  });

  it("tolerates a fenced json block around the object", () => {
    const result = parseModelProposal(`\`\`\`json\n${VALID_CONTENT}\n\`\`\``);
    expect(result.status).toBe("valid");
  });

  it("rejects empty content as an empty proposal", () => {
    const result = parseModelProposal("   ");
    expect(result).toMatchObject({
      status: "invalid",
      rejectionCode: "empty_proposal",
    });
  });

  it("rejects non-JSON chatter as a schema mismatch", () => {
    const result = parseModelProposal("I think there might be a BOLA issue.");
    expect(result).toMatchObject({
      status: "invalid",
      rejectionCode: "schema_mismatch",
    });
  });

  it("rejects prompt-injected executable fields as forbidden", () => {
    const injected = JSON.stringify({
      ...JSON.parse(VALID_CONTENT) as Record<string, unknown>,
      requestedTest: {
        packId: "bola-invoice-v1",
        objective: "Verify ownership enforcement",
        shellCommand: "curl http://169.254.169.254/",
      },
    });
    const result = parseModelProposal(injected);
    expect(result).toMatchObject({
      status: "invalid",
      rejectionCode: "forbidden_field",
    });
  });

  it("rejects a hallucinated test pack as unknown", () => {
    const hallucinated = JSON.stringify({
      ...JSON.parse(VALID_CONTENT) as Record<string, unknown>,
      requestedTest: {
        packId: "ssrf-steal-metadata-v9",
        objective: "Read cloud credentials",
      },
    });
    const result = parseModelProposal(hallucinated);
    expect(result).toMatchObject({
      status: "invalid",
      rejectionCode: "unknown_pack",
    });
  });

  it("rejects a stale schema version without cross-version parsing", () => {
    const stale = JSON.stringify({
      ...JSON.parse(VALID_CONTENT) as Record<string, unknown>,
      schemaVersion: 999,
    });
    const result = parseModelProposal(stale);
    expect(result).toMatchObject({
      status: "invalid",
      rejectionCode: "stale_version",
    });
  });

  it("rejects shell metacharacters in prose objectives", () => {
    const evil = JSON.stringify({
      ...JSON.parse(VALID_CONTENT) as Record<string, unknown>,
      requestedTest: {
        packId: "bola-invoice-v1",
        objective: "check `id` and $(whoami) now",
      },
    });
    expect(parseModelProposal(evil).status).toBe("invalid");
  });
});

describe("redactForStorage", () => {
  it("strips credential-bearing keys and embedded key material", () => {
    const redacted = redactForStorage({
      api_key: "sk-abcdef1234567890",
      nested: { authorization: "Bearer abc.def.ghi", note: "hello" },
    });
    const text = JSON.stringify(redacted);
    expect(text).not.toContain("sk-abcdef1234567890");
    expect(text).not.toContain("abc.def.ghi");
    expect(text).toContain("[redacted]");
  });
});
