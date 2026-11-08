import { describe, expect, it } from "vitest";
import {
  ContainmentEventSchema,
  RunnerInstanceSchema,
  SandboxRequestSchema,
  SandboxResultSchema,
  TargetServiceAliasSchema,
} from "./sandbox.js";

const SCAN_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
const RUNNER_ID = "66666666-6666-4666-8666-666666666666";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const CONTAINMENT_ID = "77777777-7777-4777-8777-777777777777";
const NONCE = "a".repeat(32);
const POLICY_HASH = "b".repeat(64);

const VALID_REQUEST = {
  schemaVersion: 1,
  scanId: SCAN_ID,
  attemptId: ATTEMPT_ID,
  policyHash: POLICY_HASH,
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  targetServiceAlias: "target-lab",
  actorCredentialRef: "ref:synthetic:alice_session",
  nonce: NONCE,
  permittedMethods: ["GET"],
  limits: {
    maxDurationSeconds: 30,
    maxRequests: 8,
    maxMemoryMb: 256,
    maxCpuMillicores: 500,
    maxPids: 32,
  },
  targetImageDigest: "sha256:" + "c".repeat(64),
};

describe("SandboxRequestSchema (controller-only)", () => {
  it("accepts the bounded lab request", () => {
    const parsed = SandboxRequestSchema.parse(VALID_REQUEST);
    expect(parsed.targetServiceAlias).toBe("target-lab");
  });

  it("rejects an arbitrary target host alias", () => {
    expect(() =>
      SandboxRequestSchema.parse({
        ...VALID_REQUEST,
        targetServiceAlias: "https://evil.example",
      }),
    ).toThrow();
    expect(() =>
      TargetServiceAliasSchema.parse("customer-production"),
    ).toThrow();
  });

  it("rejects injected URL / shell / privilege fields", () => {
    for (const malicious of [
      { targetUrl: "https://169.254.169.254/" },
      { shell: "id" },
      { command: "curl evil.example" },
      { privileged: true },
      { envSecrets: { VULTR_KEY: "x" } },
    ]) {
      expect(() =>
        SandboxRequestSchema.parse({ ...VALID_REQUEST, ...malicious }),
      ).toThrow();
    }
  });

  it("rejects a raw secret passed as the credential", () => {
    expect(() =>
      SandboxRequestSchema.parse({
        ...VALID_REQUEST,
        actorCredentialRef: "Bearer eyJhbGciOiJIUzI1NiJ9.raw",
      }),
    ).toThrow();
  });

  it("rejects limits above the H hard caps", () => {
    expect(() =>
      SandboxRequestSchema.parse({
        ...VALID_REQUEST,
        limits: { ...VALID_REQUEST.limits, maxDurationSeconds: 3600 },
      }),
    ).toThrow();
  });
});

describe("SandboxResultSchema", () => {
  const base = {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    runnerId: RUNNER_ID,
    nonce: NONCE,
    status: "completed",
    exitCode: 0,
    baselineAssertion: { passed: true, detail: "Alice reads invoice_A" },
    negativeAssertion: { passed: true, detail: "Bob invoice denied (403)" },
    exchanges: [
      {
        method: "GET",
        path: "/api/invoices/inv_A",
        status: 200,
        bodyHash: "d".repeat(64),
      },
    ],
    resourceUsage: { wallMs: 1200, maxRssMb: 96, requestsMade: 2 },
    containmentEventIds: [],
    artifactDigests: ["e".repeat(64)],
    completedAt: "2026-11-06T15:01:00Z",
  };

  it("accepts a well-formed runner result", () => {
    expect(SandboxResultSchema.parse(base).nonce).toBe(NONCE);
  });

  it("rejects a non-GET exchange method", () => {
    expect(() =>
      SandboxResultSchema.parse({
        ...base,
        exchanges: [
          { method: "POST", path: "/", status: 200, bodyHash: "d".repeat(64) },
        ],
      }),
    ).toThrow();
  });
});

describe("ContainmentEventSchema (denials, not findings)", () => {
  const base = {
    id: CONTAINMENT_ID,
    workspaceId: WORKSPACE_ID,
    scanId: SCAN_ID,
    attemptId: ATTEMPT_ID,
    runnerId: RUNNER_ID,
    ruleId: "network.egress_denied",
    policyVersion: "policy-v1",
    deniedOperation: "egress to 169.254.169.254:80",
    allowed: false,
    runtimeEnforced: true,
    observedAt: "2026-11-06T15:00:30Z",
    safeSummary: "Out-of-scope network attempt denied by runtime",
  };

  it("accepts a real runtime denial", () => {
    expect(ContainmentEventSchema.parse(base).allowed).toBe(false);
  });

  it("rejects a fabricated 'allowed' containment record", () => {
    expect(() =>
      ContainmentEventSchema.parse({ ...base, allowed: true }),
    ).toThrow();
    expect(() =>
      ContainmentEventSchema.parse({ ...base, runtimeEnforced: false }),
    ).toThrow();
  });
});

describe("RunnerInstanceSchema", () => {
  it("requires cleanup-relevant lifecycle fields", () => {
    const parsed = RunnerInstanceSchema.parse({
      id: RUNNER_ID,
      workspaceId: WORKSPACE_ID,
      scanId: SCAN_ID,
      sandboxId: "sandbox-abc123",
      imageDigest: "sha256:" + "f".repeat(64),
      networkProfile: "lab-isolated",
      limits: VALID_REQUEST.limits,
      status: "cleanup_verified",
      createdAt: "2026-11-06T15:00:00Z",
      startedAt: "2026-11-06T15:00:01Z",
      terminatedAt: "2026-11-06T15:00:40Z",
      cleanupVerifiedAt: "2026-11-06T15:00:41Z",
      timeoutAt: null,
      exitCode: 0,
      reason: null,
    });
    expect(parsed.status).toBe("cleanup_verified");
  });
});
