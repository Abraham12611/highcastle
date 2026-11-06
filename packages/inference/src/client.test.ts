import { describe, expect, it } from "vitest";
import { ModelProposalSchema } from "@highcastle/contracts";
import { VultrInferenceClient } from "./client.js";
import type { ResolvedVultrConfig } from "./config.js";
import { VultrInferenceError } from "./errors.js";

const VALID_PROPOSAL_CONTENT = JSON.stringify({
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

const INPUT = {
  sanitizedSourceContext: "GET /api/invoices/:id reads by id; owner check unknown.",
  scopeSummary: "Owned synthetic lab only; pack bola-invoice-v1.",
};

function testConfig(overrides?: Partial<ResolvedVultrConfig>): ResolvedVultrConfig {
  return {
    apiKey: "sk-test-SECRET-value-abc123",
    model: "test-model-id",
    baseUrl: "https://api.vultrinference.com/v1",
    timeoutMs: 5_000,
    maxRetries: 2,
    maxTokens: 128,
    ...overrides,
  };
}

function completionResponse(
  content: string,
  init?: { status?: number; headers?: Record<string, string>; id?: string },
): Response {
  return new Response(
    JSON.stringify({
      id: init?.id ?? "vultr-req-1",
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 42, completion_tokens: 77 },
    }),
    {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    },
  );
}

function stubFetch(handler: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
  return (async (url: unknown, init?: unknown) =>
    handler(url as string, (init ?? {}) as RequestInit)) as unknown as typeof fetch;
}

const noSleep = async (): Promise<void> => {};

describe("VultrInferenceClient.generateHypothesis", () => {
  it("returns a validated proposal with safe metadata on success", async () => {
    let seenUrl = "";
    let seenBody = "";
    const fetchImpl = stubFetch(async (url, init) => {
      seenUrl = url;
      seenBody = String(init.body);
      return completionResponse(VALID_PROPOSAL_CONTENT);
    });
    const client = new VultrInferenceClient(testConfig({ maxRetries: 0 }), {
      fetchImpl,
      sleep: noSleep,
    });

    const result = await client.generateHypothesis(INPUT);

    expect(seenUrl).toBe(
      "https://api.vultrinference.com/v1/chat/completions",
    );
    expect(JSON.parse(seenBody) as Record<string, unknown>).toMatchObject({
      model: "test-model-id",
    });
    expect(result.validationStatus).toBe("valid");
    expect(result.proposal?.requestedTest.packId).toBe("bola-invoice-v1");
    expect(() =>
      ModelProposalSchema.parse(result.proposal),
    ).not.toThrow();
    expect(result.metadata).toMatchObject({
      provider: "vultr",
      model: "test-model-id",
      requestId: "vultr-req-1",
      tokensInput: 42,
      tokensOutput: 77,
      outcome: "success",
      errorCode: null,
    });
  });

  it("reports malformed model JSON as invalid, never throwing", async () => {
    const fetchImpl = stubFetch(async () =>
      completionResponse("definitely not json {{{"),
    );
    const client = new VultrInferenceClient(testConfig({ maxRetries: 0 }), {
      fetchImpl,
      sleep: noSleep,
    });

    const result = await client.generateHypothesis(INPUT);

    expect(result.proposal).toBeNull();
    expect(result.validationStatus).toBe("invalid");
    expect(result.metadata.outcome).toBe("malformed");
    expect(result.metadata.errorCode).toBe("malformed");
  });

  it("maps prompt-injected executable fields to a policy conflict", async () => {
    const injected = JSON.stringify({
      ...JSON.parse(VALID_PROPOSAL_CONTENT) as Record<string, unknown>,
      requestedTest: {
        packId: "bola-invoice-v1",
        objective: "Verify ownership enforcement",
        targetUrl: "https://arbitrary.example/steal",
      },
    });
    const fetchImpl = stubFetch(async () => completionResponse(injected));
    const client = new VultrInferenceClient(testConfig({ maxRetries: 0 }), {
      fetchImpl,
      sleep: noSleep,
    });

    const result = await client.generateHypothesis(INPUT);

    expect(result.proposal).toBeNull();
    expect(result.rejectionCode).toBe("forbidden_field");
    expect(result.metadata.outcome).toBe("policy_conflict");
  });

  it("retries a rate limit once and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = stubFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return completionResponse(VALID_PROPOSAL_CONTENT);
    });
    const client = new VultrInferenceClient(testConfig(), {
      fetchImpl,
      sleep: noSleep,
    });

    const result = await client.generateHypothesis(INPUT);

    expect(calls).toBe(2);
    expect(result.validationStatus).toBe("valid");
  });

  it("throws rate_limited when retries are exhausted, with Retry-After honored", async () => {
    const fetchImpl = stubFetch(async () => {
      return new Response("slow down", {
        status: 429,
        headers: { "retry-after": "2" },
      });
    });
    const client = new VultrInferenceClient(
      testConfig({ maxRetries: 0 }),
      { fetchImpl, sleep: noSleep },
    );

    const error = await client
      .generateHypothesis(INPUT)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(VultrInferenceError);
    expect((error as VultrInferenceError).code).toBe("rate_limited");
    expect((error as VultrInferenceError).retryAfterMs).toBe(2000);
    expect(String(error)).not.toContain("sk-test-SECRET-value-abc123");
  });

  it("throws timeout when the provider never answers", async () => {
    const fetchImpl = stubFetch(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const client = new VultrInferenceClient(
      testConfig({ maxRetries: 0 }),
      { fetchImpl, sleep: noSleep },
    );

    const error = await client
      .generateHypothesis(INPUT)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(VultrInferenceError);
    expect((error as VultrInferenceError).code).toBe("timeout");
  });

  it("throws unavailable_model when Vultr reports an unknown model", async () => {
    const fetchImpl = stubFetch(async () => {
      return new Response(
        JSON.stringify({ error: { message: "model 'nope' not found" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    });
    const client = new VultrInferenceClient(
      testConfig({ maxRetries: 2 }),
      { fetchImpl, sleep: noSleep },
    );

    const error = await client
      .generateHypothesis(INPUT)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(VultrInferenceError);
    expect((error as VultrInferenceError).code).toBe("unavailable_model");
  });

  it("throws provider_error after exhausting retries on 5xx", async () => {
    let calls = 0;
    const fetchImpl = stubFetch(async () => {
      calls += 1;
      return new Response("boom", { status: 500 });
    });
    const client = new VultrInferenceClient(testConfig({ maxRetries: 1 }), {
      fetchImpl,
      sleep: noSleep,
    });

    const error = await client
      .generateHypothesis(INPUT)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(VultrInferenceError);
    expect((error as VultrInferenceError).code).toBe("provider_error");
    expect(calls).toBe(2);
  });

  it("throws provider_error on network failure without leaking the key", async () => {
    const fetchImpl = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new VultrInferenceClient(
      testConfig({ maxRetries: 0 }),
      { fetchImpl, sleep: noSleep },
    );

    const error = await client
      .generateHypothesis(INPUT)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(VultrInferenceError);
    expect((error as VultrInferenceError).code).toBe("provider_error");
    expect(String(error)).not.toContain("sk-test-SECRET-value-abc123");
  });

  it("treats a non-JSON provider envelope as malformed", async () => {
    const fetchImpl = stubFetch(async () => new Response("<html>oops</html>", { status: 200 }));
    const client = new VultrInferenceClient(testConfig({ maxRetries: 0 }), {
      fetchImpl,
      sleep: noSleep,
    });

    const result = await client.generateHypothesis(INPUT);

    expect(result.proposal).toBeNull();
    expect(result.metadata.outcome).toBe("malformed");
  });
});

describe("non-Vultr fallback is blocked", () => {
  it("fromEnv refuses an OpenAI endpoint instead of using it", () => {
    expect(() =>
      VultrInferenceClient.fromEnv({
        VULTR_INFERENCE_API_KEY: "sk-test",
        VULTR_INFERENCE_MODEL: "whatever",
        VULTR_INFERENCE_BASE_URL: "https://api.openai.com/v1",
      }),
    ).toThrowError(VultrInferenceError);
  });
});
