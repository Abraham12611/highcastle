import { describe, expect, it } from "vitest";
import {
  CreateScanRequestSchema,
  ScanEventSchema,
  ScanHistoryQuerySchema,
  ScanSchema,
  ScanSummarySchema,
  isNextEventSeq,
  toScanSummary,
  type Scan,
} from "./scans.js";
import { isTerminalScanStatus } from "./enums.js";

const ENV_ID = "88888888-8888-4888-8888-888888888888";
const TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SCOPE_ID = "99999999-9999-4999-8999-999999999999";
const SCAN_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EVENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("CreateScanRequestSchema", () => {
  const base = {
    environmentId: ENV_ID,
    targetId: TARGET_ID,
    authorizationScopeId: SCOPE_ID,
    testPackIds: ["bola-invoice-v1"],
  };

  it("accepts the H restricted scan request", () => {
    const parsed = CreateScanRequestSchema.parse(base);
    expect(parsed.type).toBe("targeted_red_team");
    expect(parsed.testPackIds).toEqual(["bola-invoice-v1"]);
  });

  it("rejects an arbitrary host/target URL field", () => {
    expect(() =>
      CreateScanRequestSchema.parse({ ...base, targetUrl: "https://x.example" }),
    ).toThrow();
  });

  it("rejects an unknown pack and an empty pack list", () => {
    expect(() => CreateScanRequestSchema.parse({ ...base, testPackIds: ["nmap-full"] })).toThrow();
    expect(() => CreateScanRequestSchema.parse({ ...base, testPackIds: [] })).toThrow();
  });
});

describe("scan lifecycle helpers", () => {
  it("classifies terminal vs active statuses", () => {
    for (const s of ["completed", "partial", "failed", "canceled"] as const) {
      expect(isTerminalScanStatus(s)).toBe(true);
    }
    for (const s of ["queued", "executing", "verifying"] as const) {
      expect(isTerminalScanStatus(s)).toBe(false);
    }
  });

  it("enforces strictly increasing event seq", () => {
    expect(isNextEventSeq([], 1)).toBe(true);
    expect(isNextEventSeq([1, 2, 3], 4)).toBe(true);
    expect(isNextEventSeq([1, 2, 3], 3)).toBe(false);
    expect(isNextEventSeq([1, 2, 3], 5)).toBe(false);
  });
});

describe("ScanEventSchema", () => {
  const base = {
    id: EVENT_ID,
    workspaceId: WORKSPACE_ID,
    scanId: SCAN_ID,
    seq: 4,
    schemaVersion: 1,
    safeSummary: "Cross-account response recorded",
    occurredAt: "2026-11-06T15:00:00Z",
  };

  it("requires attemptId on test.executed", () => {
    const ok = ScanEventSchema.parse({
      ...base,
      eventType: "test.executed",
      phase: "executing",
      actorType: "runner",
      attemptId: "55555555-5555-4555-8555-555555555555",
    });
    expect(ok.eventType).toBe("test.executed");
    expect(() =>
      ScanEventSchema.parse({
        ...base,
        eventType: "test.executed",
        phase: "executing",
        actorType: "runner",
        attemptId: null,
      }),
    ).toThrow();
  });

  it("rejects unknown event types", () => {
    expect(() =>
      ScanEventSchema.parse({
        ...base,
        eventType: "finding.hacked",
        phase: null,
        actorType: "system",
        attemptId: null,
      }),
    ).toThrow();
  });

  it("rejects finding.confirmed with an invalid findingId UUID", () => {
    expect(() =>
      ScanEventSchema.parse({
        ...base,
        eventType: "finding.confirmed",
        phase: "verifying",
        actorType: "oracle",
        attemptId: null,
        payloadRedacted: { findingId: "not-a-uuid" },
      }),
    ).toThrow();
  });

  it("rejects finding.confirmed with a missing findingId", () => {
    expect(() =>
      ScanEventSchema.parse({
        ...base,
        eventType: "finding.confirmed",
        phase: "verifying",
        actorType: "oracle",
        attemptId: null,
        payloadRedacted: { note: "no reference" },
      }),
    ).toThrow();
    expect(() =>
      ScanEventSchema.parse({
        ...base,
        eventType: "finding.confirmed",
        phase: "verifying",
        actorType: "oracle",
        attemptId: null,
      }),
    ).toThrow();
  });

  it("accepts finding.confirmed with a valid findingId UUID", () => {
    const parsed = ScanEventSchema.parse({
      ...base,
      eventType: "finding.confirmed",
      phase: "verifying",
      actorType: "oracle",
      attemptId: null,
      payloadRedacted: {
        findingId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
    });
    expect(parsed.eventType).toBe("finding.confirmed");
  });

  it("rejects test.executed with a malformed attemptId", () => {
    expect(() =>
      ScanEventSchema.parse({
        ...base,
        eventType: "test.executed",
        phase: "executing",
        actorType: "runner",
        attemptId: "attempt-1",
      }),
    ).toThrow();
  });
});

describe("toScanSummary", () => {
  it("marks terminal scans and carries version pins", () => {
    const scan: Scan = ScanSchema.parse({
      id: SCAN_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      scopeId: SCOPE_ID,
      sourceSnapshotRef: null,
      targetId: TARGET_ID,
      environmentId: ENV_ID,
      targetRevision: "lab-v1-vulnerable",
      fixtureVersion: "1.0.0",
      scanType: "targeted_red_team",
      testPackIds: ["bola-invoice-v1"],
      testPackVersions: { "bola-invoice-v1": "1.0.0" },
      requestedByUserId: USER_ID,
      idempotencyKey: null,
      status: "completed",
      phase: "finalizing",
      planVersion: 1,
      plannedCount: 1,
      executedCount: 1,
      confirmedCount: 1,
      startedAt: "2026-11-06T15:00:00Z",
      endedAt: "2026-11-06T15:02:00Z",
      cancelRequestedAt: null,
      failureCode: null,
      publicDemo: false,
      createdAt: "2026-11-06T14:59:00Z",
      updatedAt: "2026-11-06T15:02:00Z",
    });
    const summary = toScanSummary(scan, {
      oracleVersion: "bola-oracle-v1",
      scopeHash: "a".repeat(64),
    });
    expect(summary.terminal).toBe(true);
    expect(summary.coverage.oracleVersion).toBe("bola-oracle-v1");
    expect(summary.versions.targetRevision).toBe("lab-v1-vulnerable");
  });

  it("surfaces the persisted failureCode verbatim (issue #92)", async () => {
    const scan: Scan = ScanSchema.parse({
      id: SCAN_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      scopeId: SCOPE_ID,
      sourceSnapshotRef: null,
      targetId: TARGET_ID,
      environmentId: ENV_ID,
      targetRevision: "lab-v1-vulnerable",
      fixtureVersion: "1.0.0",
      scanType: "targeted_red_team",
      testPackIds: ["bola-invoice-v1"],
      testPackVersions: { "bola-invoice-v1": "1.0.0" },
      requestedByUserId: USER_ID,
      idempotencyKey: null,
      status: "failed",
      phase: "executing",
      planVersion: 1,
      plannedCount: 1,
      executedCount: 0,
      confirmedCount: 0,
      startedAt: "2026-11-08T08:00:00Z",
      endedAt: "2026-11-08T08:00:07Z",
      cancelRequestedAt: null,
      failureCode: "sandbox_precondition",
      publicDemo: false,
      createdAt: "2026-11-08T07:59:00Z",
      updatedAt: "2026-11-08T08:00:07Z",
    });
    const summary = toScanSummary(scan, {
      oracleVersion: "bola-oracle-v1",
      scopeHash: "a".repeat(64),
    });
    expect(summary.failureCode).toBe("sandbox_precondition");
    expect(ScanSummarySchema.parse(summary).failureCode).toBe("sandbox_precondition");
  });
});

describe("ScanHistoryQuerySchema", () => {
  it("defaults limit and accepts a status filter", () => {
    const parsed = ScanHistoryQuerySchema.parse({ status: "completed" });
    expect(parsed.limit).toBe(20);
  });
});
