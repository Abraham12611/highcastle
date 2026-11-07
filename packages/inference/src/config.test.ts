import { describe, expect, it } from "vitest";
import { VultrInferenceError } from "./errors.js";
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_VULTR_BASE_URL,
  describeConfigForLogging,
  resolveVultrConfig,
} from "./config.js";

const ENV = (overrides: Record<string, string | undefined>) => ({
  VULTR_INFERENCE_API_KEY: "sk-test-key",
  VULTR_INFERENCE_MODEL: "test-model",
  ...overrides,
});

describe("resolveVultrConfig", () => {
  it("resolves the default approved Vultr endpoint", () => {
    const config = resolveVultrConfig(ENV({}));
    expect(config.baseUrl).toBe(DEFAULT_VULTR_BASE_URL);
    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(config.maxRetries).toBe(DEFAULT_MAX_RETRIES);
    expect(config.maxTokens).toBe(DEFAULT_MAX_TOKENS);
  });

  it("throws missing_credentials without inventing a key", () => {
    const error = (() => {
      try {
        resolveVultrConfig(ENV({ VULTR_INFERENCE_API_KEY: undefined }));
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(VultrInferenceError);
    expect((error as VultrInferenceError).code).toBe("missing_credentials");
  });

  it("throws missing_model without inventing a supported model ID", () => {
    const error = (() => {
      try {
        resolveVultrConfig(ENV({ VULTR_INFERENCE_MODEL: "   " }));
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(VultrInferenceError);
    expect((error as VultrInferenceError).code).toBe("missing_model");
  });

  it("blocks a non-Vultr endpoint so no silent provider fallback is possible", () => {
    for (const baseUrl of [
      "https://api.openai.com/v1",
      "https://api.anthropic.com/v1",
      "https://evil.example.com/v1",
    ]) {
      const error = (() => {
        try {
          resolveVultrConfig(ENV({ VULTR_INFERENCE_BASE_URL: baseUrl }));
          return null;
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(VultrInferenceError);
      expect((error as VultrInferenceError).code).toBe(
        "non_vultr_endpoint_blocked",
      );
    }
  });

  it("rejects non-https endpoints", () => {
    expect(() =>
      resolveVultrConfig(
        ENV({ VULTR_INFERENCE_BASE_URL: "http://api.vultrinference.com/v1" }),
      ),
    ).toThrowError(VultrInferenceError);
  });

  it("rejects non-numeric tuning values and caps extremes", () => {
    expect(() =>
      resolveVultrConfig(ENV({ VULTR_INFERENCE_TIMEOUT_MS: "soon" })),
    ).toThrowError(VultrInferenceError);
    const capped = resolveVultrConfig(
      ENV({
        VULTR_INFERENCE_TIMEOUT_MS: "999999999",
        VULTR_INFERENCE_MAX_RETRIES: "999",
        VULTR_INFERENCE_MAX_TOKENS: "999999",
      }),
    );
    expect(capped.timeoutMs).toBeLessThanOrEqual(120_000);
    expect(capped.maxRetries).toBeLessThanOrEqual(4);
    expect(capped.maxTokens).toBeLessThanOrEqual(4096);
  });

  it("rejects credentials embedded in URL userinfo", () => {
    for (const baseUrl of [
      "https://user:pass@api.vultrinference.com/v1",
      "https://api-key-here@api.vultrinference.com/v1",
    ]) {
      const error = (() => {
        try {
          resolveVultrConfig(ENV({ VULTR_INFERENCE_BASE_URL: baseUrl }));
          return null;
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(VultrInferenceError);
      expect((error as VultrInferenceError).code).toBe("invalid_config");
    }
  });

  it("rejects query strings, fragments, and unexpected ports", () => {
    for (const baseUrl of [
      "https://api.vultrinference.com/v1?api_key=abc",
      "https://api.vultrinference.com/v1#fragment",
      "https://api.vultrinference.com:8443/v1",
    ]) {
      expect(() =>
        resolveVultrConfig(ENV({ VULTR_INFERENCE_BASE_URL: baseUrl })),
      ).toThrowError(VultrInferenceError);
    }
  });

  it("allows only the documented Vultr base path", () => {
    for (const baseUrl of [
      "https://api.vultrinference.com",
      "https://api.vultrinference.com/",
      "https://api.vultrinference.com/v2",
      "https://api.vultrinference.com/v1/extra",
      "https://api.vultrinference.com/v1/../admin",
    ]) {
      expect(() =>
        resolveVultrConfig(ENV({ VULTR_INFERENCE_BASE_URL: baseUrl })),
      ).toThrowError(VultrInferenceError);
    }
    expect(
      resolveVultrConfig(
        ENV({ VULTR_INFERENCE_BASE_URL: "https://api.vultrinference.com/v1/" }),
      ).baseUrl,
    ).toBe("https://api.vultrinference.com/v1");
  });

  it("never exposes the key in the log-safe description", () => {
    const config = resolveVultrConfig(
      ENV({ VULTR_INFERENCE_API_KEY: "sk-super-secret-value" }),
    );
    const described = describeConfigForLogging(config);
    expect(JSON.stringify(described)).not.toContain("sk-super-secret-value");
    expect(described.credentialsPresent).toBe(true);
    expect(described.model).toBe("test-model");
  });
});
