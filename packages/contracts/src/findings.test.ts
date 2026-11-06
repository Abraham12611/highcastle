import { describe, expect, it } from "vitest";
import {
  EvidenceArtifactSchema,
  FindingSchema,
  TriageFindingRequestSchema,
} from "./findings.js";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FINDING_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SCAN_ID = "11111111-1111-4111-8111-111111111111";
const ARTIFACT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const VALID_FINDING = {
  id: FINDING_ID,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  stableFingerprint: "bola:invoice_lookup:owner_check",
  title: "Invoice object authorization bypass",
  summary: "Alice reads Bob's invoice via ID lookup.",
  category: "broken_object_authorization",
  severity: "high",
  confidence: "confirmed_by_execution",
  remediationStatus: "open",
  firstSeenAt: "2026-11-06T15:00:00Z",
  lastSeenAt: "2026-11-06T15:00:00Z",
  latestConfirmedAttemptId: null,
  ownerUserId: null,
  createdAt: "2026-11-06T15:00:00Z",
  updatedAt: "2026-11-06T15:00:00Z",
};

describe("FindingSchema (three independent axes)", () => {
  it("accepts severity/confidence/status varying independently", () => {
    expect(
      FindingSchema.parse({
        ...VALID_FINDING,
        severity: "low",
        confidence: "suspected",
        remediationStatus: "accepted_risk",
      }).remediationStatus,
    ).toBe("accepted_risk");
  });

  it("rejects unknown axis values", () => {
    expect(() =>
      FindingSchema.parse({ ...VALID_FINDING, severity: "catastrophic" }),
    ).toThrow();
    expect(() =>
      FindingSchema.parse({ ...VALID_FINDING, confidence: "definitely" }),
    ).toThrow();
  });
});

describe("TriageFindingRequestSchema (no self-awarded fix)", () => {
  it("accepts human triage moves with a reason", () => {
    expect(
      TriageFindingRequestSchema.parse({
        toStatus: "accepted_risk",
        reason: "Demo-only lab exposure",
      }).toStatus,
    ).toBe("accepted_risk");
  });

  it("rejects verified_fixed via triage (replay oracle only)", () => {
    expect(() =>
      TriageFindingRequestSchema.parse({
        toStatus: "verified_fixed",
        reason: "Looks fixed to me",
      }),
    ).toThrow();
  });
});

describe("EvidenceArtifactSchema", () => {
  const base = {
    id: ARTIFACT_ID,
    workspaceId: WORKSPACE_ID,
    scanId: SCAN_ID,
    attemptId: null,
    artifactKind: "redacted_response",
    storageKind: "object",
    storageKey: "tenant-abc/artifacts/" + "0".repeat(32),
    sha256: "a".repeat(64),
    byteSize: 512,
    contentType: "application/json",
    redacted: true,
    retentionUntil: null,
    createdAt: "2026-11-06T15:00:00Z",
  };

  it("accepts a redacted stored artifact", () => {
    expect(EvidenceArtifactSchema.parse(base).redacted).toBe(true);
  });

  it("rejects unredacted or guessable-key artifacts", () => {
    expect(() =>
      EvidenceArtifactSchema.parse({ ...base, redacted: false }),
    ).toThrow();
    expect(() =>
      EvidenceArtifactSchema.parse({ ...base, storageKey: "a.json" }),
    ).toThrow();
  });
});
