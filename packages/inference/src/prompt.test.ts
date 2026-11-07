import { describe, expect, it } from "vitest";
import { CONTRACT_SCHEMA_VERSION } from "@highcastle/contracts";
import {
  ALLOWED_HYPOTHESIS_PACK_ID,
  buildHypothesisMessages,
} from "./prompt.js";

const INPUT = {
  sanitizedSourceContext:
    "GET /api/invoices/:id reads an invoice by id; owner check status unknown.",
  scopeSummary:
    "Owned synthetic lab only; pack bola-invoice-v1; roles alice+bob; max 8 requests.",
  routeSummary: "GET /api/invoices/:id",
};

describe("buildHypothesisMessages", () => {
  it("constrains the model to the single allowed pack and schema version", () => {
    const messages = buildHypothesisMessages(INPUT);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
    const system = messages[0]?.content ?? "";
    expect(system).toContain(ALLOWED_HYPOTHESIS_PACK_ID);
    expect(system).toContain(`"schemaVersion": ${CONTRACT_SCHEMA_VERSION}`);
    expect(system).toContain("no command");
  });

  it("carries the sanitized context and scope summary to the model", () => {
    const user = buildHypothesisMessages(INPUT)[1]?.content ?? "";
    expect(user).toContain("GET /api/invoices/:id");
    expect(user).toContain("Owned synthetic lab only");
  });

  it("rejects empty inputs instead of sending an unbounded prompt", () => {
    expect(() =>
      buildHypothesisMessages({ ...INPUT, sanitizedSourceContext: "  " }),
    ).toThrow();
    expect(() =>
      buildHypothesisMessages({ ...INPUT, scopeSummary: "" }),
    ).toThrow();
  });

  it("clips oversized context to the documented token budget", () => {
    const messages = buildHypothesisMessages({
      ...INPUT,
      sanitizedSourceContext: "x".repeat(50_000),
    });
    const user = messages[1]?.content ?? "";
    expect(user.length).toBeLessThan(10_000);
  });
});
