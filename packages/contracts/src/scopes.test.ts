import { describe, expect, it } from "vitest";
import {
  CreateAuthorizationScopeRequestSchema,
  PreflightResponseSchema,
} from "./scopes.js";

const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENV_ID = "88888888-8888-4888-8888-888888888888";

const VALID_SCOPE = {
  projectId: PROJECT_ID,
  targetId: TARGET_ID,
  permittedEnvironmentId: ENV_ID,
  allowedHosts: ["target-lab.internal"],
  allowedPaths: ["/api/invoices"],
  deniedPaths: ["/api/admin"],
  allowedTestPackIds: ["bola-invoice-v1"],
  allowedMethods: ["GET"],
  maxDurationSeconds: 120,
  maxRequests: 16,
  maxConcurrency: 2,
  maxMemoryMb: 512,
  expiresAt: "2026-11-07T15:00:00Z",
};

describe("CreateAuthorizationScopeRequestSchema", () => {
  it("accepts the locked H lab scope", () => {
    const parsed = CreateAuthorizationScopeRequestSchema.parse(VALID_SCOPE);
    expect(parsed.allowedHosts).toEqual(["target-lab.internal"]);
  });

  it("rejects URLs, wildcards, and IPs-as-hosts abuse in allowedHosts", () => {
    for (const hosts of [
      ["https://target-lab.internal/api"],
      ["*"],
      ["a".repeat(300)],
    ]) {
      expect(() =>
        CreateAuthorizationScopeRequestSchema.parse({
          ...VALID_SCOPE,
          allowedHosts: hosts,
        }),
      ).toThrow();
    }
  });

  it("rejects relative scope paths and budgets above hard caps", () => {
    expect(() =>
      CreateAuthorizationScopeRequestSchema.parse({
        ...VALID_SCOPE,
        allowedPaths: ["api/invoices"],
      }),
    ).toThrow();
    expect(() =>
      CreateAuthorizationScopeRequestSchema.parse({
        ...VALID_SCOPE,
        maxDurationSeconds: 3600,
      }),
    ).toThrow();
    expect(() =>
      CreateAuthorizationScopeRequestSchema.parse({
        ...VALID_SCOPE,
        allowedMethods: ["POST"],
      }),
    ).toThrow();
  });
});

describe("PreflightResponseSchema", () => {
  it("requires at least one check", () => {
    expect(() =>
      PreflightResponseSchema.parse({
        ok: true,
        checks: [],
        scopeHash: "a".repeat(64),
        targetRevision: "lab-v1-vulnerable",
      }),
    ).toThrow();
  });
});
