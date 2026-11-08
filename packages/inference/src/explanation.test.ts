import { describe, expect, it, vi } from "vitest";
import {
  ExplanationClient,
  buildExplanationMessages,
  parseModelExplanation,
  toExplanationDbRecord,
  type ExplanationPromptInput,
} from "./explanation.js";

const INPUT: ExplanationPromptInput = {
  attemptId: "attempt-real-1",
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  targetRevision: "lab-v1-vulnerable",
  oracleVerdict: "reproduced",
  replayVerdict: null,
  positiveControlPassed: true,
  negativeSecurityConditionMet: false,
  observationSummaries: [
    "Alice read her own invoice (HTTP 200, owner user_A).",
    "Alice read Bob's invoice by known ID (HTTP 200, owner user_B).",
  ],
  evidenceRefs: [
    {
      evidenceId: "ev-own-1",
      artifactKind: "redacted_response",
      sha256: "a".repeat(64),
      byteSummary: "HTTP 200 invoice_A owned by user_A (tenant_A).",
    },
    {
      evidenceId: "ev-cross-1",
      artifactKind: "redacted_response",
      sha256: "b".repeat(64),
      byteSummary: "HTTP 200 invoice_B owned by user_B (unauthorized).",
    },
  ],
};

const VALID_MODEL_JSON = JSON.stringify({
  explanationVersion: 1,
  summary: "Alice read Bob's invoice because the lookup ignored ownership.",
  whatHappened: "The lab looked the invoice up by id alone with no tenant check.",
  whyVerdict:
    "The cross-account read returned HTTP 200 with Bob's data, so the oracle verdict reproduced follows.",
  replayMeaning: null,
  verdictEcho: "reproduced",
  attemptIdEcho: "attempt-real-1",
  evidenceIds: ["ev-own-1", "ev-cross-1"],
  followUp: "Scope the lookup to the actor tenant and replay the pack.",
});

function completionEnvelope(content: string, model = "live-model-x"): unknown {
  return {
    id: "req-live-1",
    model,
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 120, completion_tokens: 90 },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: typeof fetch): ExplanationClient {
  return new ExplanationClient(
    {
      apiKey: "test-key",
      model: "live-model-x",
      baseUrl: "https://api.vultrinference.com/v1",
      timeoutMs: 5000,
      maxRetries: 0,
      maxTokens: 512,
    },
    { fetchImpl, sleep: () => Promise.resolve(), now: () => 1000 },
  );
}

describe("parseModelExplanation", () => {
  it("accepts a grounded explanation that echoes the oracle verdict", () => {
    const result = parseModelExplanation(VALID_MODEL_JSON, INPUT);
    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.explanation.verdictEcho).toBe("reproduced");
    expect(result.explanation.evidenceIds).toEqual(["ev-own-1", "ev-cross-1"]);
  });

  it("rejects a model verdict override even when the prose agrees with it", () => {
    const tampered = JSON.stringify({
      ...JSON.parse(VALID_MODEL_JSON),
      verdictEcho: "not_reproduced",
    });
    const result = parseModelExplanation(tampered, INPUT);
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.rejectionCode).toBe("verdict_override");
  });

  it("rejects citations of unapproved evidence IDs", () => {
    const hallucinated = JSON.stringify({
      ...JSON.parse(VALID_MODEL_JSON),
      evidenceIds: ["ev-own-1", "ev-invented-9"],
    });
    const result = parseModelExplanation(hallucinated, INPUT);
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.rejectionCode).toBe("unknown_evidence_ref");
  });

  it("rejects an attempt ID mismatch", () => {
    const mismatched = JSON.stringify({
      ...JSON.parse(VALID_MODEL_JSON),
      attemptIdEcho: "attempt-someone-else",
    });
    const result = parseModelExplanation(mismatched, INPUT);
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.rejectionCode).toBe("id_mismatch");
  });

  it("rejects injected extra keys via strict schema", () => {
    const injected = JSON.stringify({
      ...JSON.parse(VALID_MODEL_JSON),
      shellCommand: "curl evil.example",
    });
    const result = parseModelExplanation(injected, INPUT);
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.rejectionCode).toBe("schema_mismatch");
  });

  it("rejects empty and non-JSON content", () => {
    expect(parseModelExplanation("   ", INPUT).status).toBe("invalid");
    const nonJson = parseModelExplanation("not json at all {{{", INPUT);
    expect(nonJson.status).toBe("invalid");
    if (nonJson.status !== "invalid") throw new Error("expected invalid");
    expect(nonJson.rejectionCode).toBe("schema_mismatch");
  });
});

describe("buildExplanationMessages", () => {
  it("sends verdicts as given facts and lists only approved evidence", () => {
    const messages = buildExplanationMessages(INPUT);
    expect(messages).toHaveLength(2);
    const user = messages[1]?.content ?? "";
    expect(user).toContain("GIVEN");
    expect(user).toContain("attempt-real-1");
    expect(user).toContain("ev-cross-1");
    expect(user).not.toContain("lab-token");
    expect(user).not.toContain("sk-");
  });
});

describe("ExplanationClient.generateExplanation", () => {
  it("returns a valid explanation with full metadata", async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> =>
      jsonResponse(completionEnvelope(VALID_MODEL_JSON)),
    ) as unknown as typeof fetch;
    const result = await clientWith(fetchImpl).generateExplanation(INPUT);
    expect(result.validationStatus).toBe("valid");
    expect(result.explanation?.verdictEcho).toBe("reproduced");
    expect(result.metadata.provider).toBe("vultr");
    expect(result.metadata.requestId).toBe("req-live-1");
    expect(result.metadata.tokensInput).toBe(120);
    expect(result.metadata.tokensOutput).toBe(90);
    expect(result.metadata.outcome).toBe("success");
    const sent = JSON.parse(
      (
        fetchImpl as unknown as {
          mock: { calls: Array<[string, RequestInit]> };
        }
      ).mock.calls[0]?.[1].body as string,
    ) as Record<string, unknown>;
    expect(sent["model"]).toBe("live-model-x");
    expect(sent["temperature"]).toBe(0);
  });

  it("rejects silent model substitution without storing the prose", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(completionEnvelope(VALID_MODEL_JSON, "different-model-y")),
    );
    const result = await clientWith(fetchImpl).generateExplanation(INPUT);
    expect(result.validationStatus).toBe("invalid");
    expect(result.rejectionCode).toBe("model_substituted");
    expect(result.explanation).toBeNull();
    expect(result.metadata.responseModel).toBe("different-model-y");
  });

  it("fails safe on timeout: null explanation, timeout outcome, verdict preserved in record", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const quickClient = new ExplanationClient(
      {
        apiKey: "test-key",
        model: "live-model-x",
        baseUrl: "https://api.vultrinference.com/v1",
        timeoutMs: 50,
        maxRetries: 0,
        maxTokens: 512,
      },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: () => Promise.resolve(),
        now: () => 1000,
      },
    );
    const result = await quickClient.generateExplanation(INPUT);
    expect(result.explanation).toBeNull();
    expect(result.rejectionCode).toBe("transport_error");
    expect(result.metadata.outcome).toBe("timeout");
    const record = toExplanationDbRecord(INPUT, result);
    expect(record.oracleVerdict).toBe("reproduced");
    expect(record.explanation).toBeNull();
    expect(record.outcome).toBe("timeout");
  });

  it("refuses to call the model when evidence is missing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(completionEnvelope(VALID_MODEL_JSON)));
    const result = await clientWith(fetchImpl).generateExplanation({
      ...INPUT,
      observationSummaries: [],
      evidenceRefs: [],
    });
    expect(result.validationStatus).toBe("invalid");
    expect(result.explanation).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("records provider errors without echoing provider text", async () => {
    const fetchImpl = vi.fn(async () => new Response("secret-shaped-body", { status: 500 }));
    const result = await clientWith(fetchImpl).generateExplanation(INPUT);
    expect(result.explanation).toBeNull();
    expect(result.metadata.outcome).toBe("error");
    expect(JSON.stringify(result.issues)).not.toContain("secret-shaped-body");
  });
});

describe("toExplanationDbRecord", () => {
  it("keeps the oracle verdict as the recorded verdict, never the model's", async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> =>
      jsonResponse(completionEnvelope(VALID_MODEL_JSON)),
    ) as unknown as typeof fetch;
    const result = await clientWith(fetchImpl).generateExplanation(INPUT);
    const record = toExplanationDbRecord(INPUT, result);
    expect(record.attemptId).toBe("attempt-real-1");
    expect(record.oracleVerdict).toBe(INPUT.oracleVerdict);
    expect(record.provider).toBe("vultr");
    expect(record.requestedModel).toBe("live-model-x");
  });
});
