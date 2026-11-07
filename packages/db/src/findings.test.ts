import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type FixtureChain, type TestDb } from "./test-utils.js";
import {
  createAttempt,
  createEvidenceArtifact,
  listEvidenceForAttempt,
  recordAttemptVerdict,
  recordContainmentEvent,
  listContainmentForScan,
} from "./repos/attempts.js";
import {
  completeReplay,
  createReplay,
  getFinding,
  getReplay,
  listFindingOccurrences,
  listFindings,
  triageFinding,
  upsertFindingFromVerdict,
} from "./repos/findings.js";
import { createScan } from "./repos/scans.js";
import { createEnvironment } from "./repos/projects.js";
import { createAuthorizationScope } from "./repos/scopes.js";
import { recordAuditEvent } from "./repos/audit.js";

/**
 * Findings, occurrences, remediation and replays.
 *
 * - Same fingerprint + project dedups to one finding with N occurrences.
 * - Confidence escalates toward `confirmed_by_execution`, never backwards.
 * - `verified_fixed` is unreachable via triage; only a replay whose oracle
 *   observations satisfy the matrix awards it (replay linkage).
 */
describe("findings and replays", () => {
  let tdb: TestDb;
  beforeAll(async () => {
    tdb = await createTestDb();
  });
  afterAll(async () => {
    await tdb.close();
  });
  afterEach(async () => {
    await tdb.reset();
  });

  async function openScanWithAttempt() {
    const f = await createFixtureChain(tdb.db);
    const scan = await createScan(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scopeId: f.scopeId,
      targetId: f.targetId,
      environmentId: f.environmentId,
      targetRevision: f.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: f.ownerId,
    });
    const attempt = await createAttempt(tdb.db, {
      workspaceId: f.workspaceId,
      scanId: scan.id,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "plan-1",
      scopeHash: f.scopeHash,
      targetRevision: f.envRevision,
    });
    return { f, scan, attempt };
  }

  /**
   * Full replay harness: patched L11 environment (`lab-v2-patched`), its own
   * approval scope, a replay scan pinned to the patched revision, a replay
   * attempt, and the persisted `oracle` evidence artifact the verdict must
   * be derived from. Mirrors the L16 replay job wiring.
   */
  async function openPatchedReplay(
    f: FixtureChain,
    input: { findingId: string; originalScanId: string; originalAttemptId: string },
  ) {
    const patchedEnv = await createEnvironment(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      label: "patched twin",
      kind: "attack_twin",
      currentRevision: "lab-v2-patched",
      fixtureVersion: "1.0.0",
      provisionStatus: "ready",
    });
    const patchedScope = await createAuthorizationScope(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      targetId: f.targetId,
      actorUserId: f.ownerId,
      allowedHosts: ["target-lab"],
      allowedPaths: ["/api/invoices"],
      allowedTestPackIds: ["bola-invoice-v1"],
      allowedMethods: ["GET"],
      maxDurationSeconds: 60,
      maxRequests: 16,
      maxConcurrency: 1,
      maxMemoryMb: 256,
      permittedEnvironmentId: patchedEnv.id,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    const replayScan = await createScan(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scopeId: patchedScope.id,
      targetId: f.targetId,
      environmentId: patchedEnv.id,
      targetRevision: "lab-v2-patched",
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: f.ownerId,
    });
    const replayAttempt = await createAttempt(tdb.db, {
      workspaceId: f.workspaceId,
      scanId: replayScan.id,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "plan-replay",
      scopeHash: patchedScope.scopeHash,
      targetRevision: "lab-v2-patched",
    });
    const oracleArtifact = await createEvidenceArtifact(tdb.db, {
      workspaceId: f.workspaceId,
      scanId: replayScan.id,
      attemptId: replayAttempt.id,
      artifactKind: "oracle",
      storageKind: "db",
      storageKey: "obj-oracle-adjudication-0001",
      sha256: "b".repeat(64),
      byteSize: 256,
      contentType: "application/json",
    });
    const replay = await createReplay(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      findingId: input.findingId,
      originalAttemptId: input.originalAttemptId,
      originalScanId: input.originalScanId,
      replayScanId: replayScan.id,
      patchedEnvironmentId: patchedEnv.id,
      patchedRevision: "lab-v2-patched",
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      approvalScopeId: patchedScope.id,
    });
    return { patchedEnv, patchedScope, replayScan, replayAttempt, oracleArtifact, replay };
  }

  const findingInput = (over: Record<string, unknown> = {}) => ({
    workspaceId: "",
    projectId: "",
    stableFingerprint: "bola:invoice_lookup:owner_check",
    title: "Invoice lookup missing ownership check",
    summary: "Cross-account invoice read returned data.",
    category: "broken_object_authorization" as const,
    severity: "high" as const,
    confidence: "supported_by_analysis" as const,
    scanId: "",
    targetRevision: "lab-v1-vulnerable",
    oracleVerdict: "reproduced" as const,
    ...over,
  });

  it("deduplicates by (project, fingerprint) with one row per sighting", async () => {
    const { f, scan, attempt } = await openScanWithAttempt();
    const base = findingInput({
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scanId: scan.id,
      attemptId: attempt.id,
    });
    const first = await upsertFindingFromVerdict(tdb.db, { ...base });
    const second = await upsertFindingFromVerdict(tdb.db, { ...base });
    expect(second.created).toBe(false);
    expect(second.finding.id).toBe(first.finding.id);
    expect(second.occurrence).toBeNull();

    // Same scan+attempt re-observed: occurrence dedups, finding stays single.
    const occurrences = await listFindingOccurrences(tdb.db, f.workspaceId, first.finding.id);
    expect(occurrences).toHaveLength(1);

    // A second attempt observing the same fingerprint adds an occurrence.
    const attempt2 = await createAttempt(tdb.db, {
      workspaceId: f.workspaceId,
      scanId: scan.id,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "plan-2",
      scopeHash: f.scopeHash,
      targetRevision: "rev-1",
    });
    const third = await upsertFindingFromVerdict(tdb.db, {
      ...base,
      attemptId: attempt2.id,
    });
    expect(third.created).toBe(false);
    expect(third.occurrence).not.toBeNull();
    expect(await listFindingOccurrences(tdb.db, f.workspaceId, first.finding.id)).toHaveLength(2);
  });

  it("escalates confidence on stronger evidence, never downgrades", async () => {
    const { f, scan, attempt } = await openScanWithAttempt();
    const base = findingInput({
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scanId: scan.id,
      attemptId: attempt.id,
    });
    const first = await upsertFindingFromVerdict(tdb.db, { ...base });
    expect(first.finding.confidence).toBe("supported_by_analysis");

    const attempt2 = await createAttempt(tdb.db, {
      workspaceId: f.workspaceId,
      scanId: scan.id,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "plan-escalate",
      scopeHash: f.scopeHash,
      targetRevision: "rev-1",
    });
    const stronger = await upsertFindingFromVerdict(tdb.db, {
      ...base,
      attemptId: attempt2.id,
      confidence: "confirmed_by_execution",
      oracleVerdict: "reproduced",
    });
    expect(stronger.finding.confidence).toBe("confirmed_by_execution");
    expect(stronger.finding.latestConfirmedAttemptId).toBe(attempt2.id);

    // Weaker later evidence must not downgrade the finding.
    const weaker = await upsertFindingFromVerdict(tdb.db, {
      ...base,
      attemptId: attempt2.id,
      confidence: "supported_by_analysis",
      oracleVerdict: "inconclusive",
    });
    expect(weaker.finding.confidence).toBe("confirmed_by_execution");
    expect(weaker.finding.latestConfirmedAttemptId).toBe(attempt2.id);
  });

  it("keeps the same fingerprint separate across projects", async () => {
    const { f, scan } = await openScanWithAttempt();
    const g = await createFixtureChain(tdb.db);
    const inA = await upsertFindingFromVerdict(
      tdb.db,
      findingInput({
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        scanId: scan.id,
      }),
    );
    const otherScan = await createScan(tdb.db, {
      workspaceId: g.workspaceId,
      projectId: g.projectId,
      scopeId: g.scopeId,
      targetId: g.targetId,
      environmentId: g.environmentId,
      targetRevision: g.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: g.ownerId,
    });
    const inB = await upsertFindingFromVerdict(
      tdb.db,
      findingInput({
        workspaceId: g.workspaceId,
        projectId: g.projectId,
        scanId: otherScan.id,
      }),
    );
    expect(inB.finding.id).not.toBe(inA.finding.id);
    expect(await listFindings(tdb.db, f.workspaceId, { projectId: f.projectId })).toHaveLength(1);
  });

  it("refuses verified_fixed via triage; replay awards it from observations", async () => {
    const { f, scan, attempt } = await openScanWithAttempt();
    const { finding } = await upsertFindingFromVerdict(
      tdb.db,
      findingInput({
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        scanId: scan.id,
        attemptId: attempt.id,
        confidence: "confirmed_by_execution",
      }),
    );
    await triageFinding(tdb.db, {
      workspaceId: f.workspaceId,
      findingId: finding.id,
      toStatus: "in_progress",
      reason: "fix in progress",
      actorType: "user",
      actorId: f.ownerId,
    });
    await expect(
      triageFinding(tdb.db, {
        workspaceId: f.workspaceId,
        findingId: finding.id,
        toStatus: "verified_fixed" as never,
        reason: "looks fixed",
        actorType: "user",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await triageFinding(tdb.db, {
      workspaceId: f.workspaceId,
      findingId: finding.id,
      toStatus: "pending_verification",
      reason: "patch ready, replay now",
      actorType: "user",
    });

    // Replay linkage: patched run, persisted oracle evidence, derived verdict.
    const { oracleArtifact, replay } = await openPatchedReplay(f, {
      findingId: finding.id,
      originalScanId: scan.id,
      originalAttemptId: attempt.id,
    });
    expect(replay.verdict).toBeNull();

    const legs = {
      oracleEvidenceId: oracleArtifact.id,
      oracleVersion: "bola-oracle-v1",
      baseline: "pass" as const,
      securityCheck: "pass" as const,
      attemptVerdict: "not_reproduced" as const,
      preconditionsOk: true,
    };
    const completed = await completeReplay(tdb.db, f.workspaceId, replay.id, legs);
    expect(completed.verdict).toBe("verified_fixed");
    expect(completed.oracleEvidenceId).toBe(oracleArtifact.id);
    expect(completed.oracleVersion).toBe("bola-oracle-v1");
    expect((await getFinding(tdb.db, f.workspaceId, finding.id))?.remediationStatus).toBe(
      "verified_fixed",
    );
    expect((await getReplay(tdb.db, f.workspaceId, replay.id))?.completedAt).not.toBeNull();

    // Double completion is a conflict, not a silent overwrite.
    await expect(completeReplay(tdb.db, f.workspaceId, replay.id, legs)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("refuses verified_fixed without persisted oracle evidence", async () => {
    const { f, scan, attempt } = await openScanWithAttempt();
    const { finding } = await upsertFindingFromVerdict(
      tdb.db,
      findingInput({
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        scanId: scan.id,
        attemptId: attempt.id,
        confidence: "confirmed_by_execution",
      }),
    );
    await triageFinding(tdb.db, {
      workspaceId: f.workspaceId,
      findingId: finding.id,
      toStatus: "pending_verification",
      reason: "patch ready, replay now",
      actorType: "user",
    });
    const { replay } = await openPatchedReplay(f, {
      findingId: finding.id,
      originalScanId: scan.id,
      originalAttemptId: attempt.id,
    });
    // Unknown artifact ID: no persisted oracle evidence, no verdict.
    await expect(
      completeReplay(tdb.db, f.workspaceId, replay.id, {
        oracleEvidenceId: "00000000-0000-4000-8000-000000000099",
        oracleVersion: "bola-oracle-v1",
        baseline: "pass",
        securityCheck: "pass",
        attemptVerdict: "not_reproduced",
        preconditionsOk: true,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    // Inconsistent legs vs recorded attempt verdict: fail closed.
    const second = await openPatchedReplay(f, {
      findingId: finding.id,
      originalScanId: scan.id,
      originalAttemptId: attempt.id,
    });
    await expect(
      completeReplay(tdb.db, f.workspaceId, second.replay.id, {
        oracleEvidenceId: second.oracleArtifact.id,
        oracleVersion: "bola-oracle-v1",
        baseline: "pass",
        securityCheck: "pass",
        attemptVerdict: "reproduced",
        preconditionsOk: true,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    // Failed preconditions force inconclusive — never verified_fixed.
    const forced = await completeReplay(tdb.db, f.workspaceId, second.replay.id, {
      oracleEvidenceId: second.oracleArtifact.id,
      oracleVersion: "bola-oracle-v1",
      baseline: "pass",
      securityCheck: "pass",
      attemptVerdict: "not_reproduced",
      preconditionsOk: false,
    });
    expect(forced.verdict).toBe("inconclusive");
    expect((await getFinding(tdb.db, f.workspaceId, finding.id))?.remediationStatus).toBe(
      "pending_verification",
    );
  });

  it("still_vulnerable replay re-opens a pending finding", async () => {
    const { f, scan, attempt } = await openScanWithAttempt();
    const { finding } = await upsertFindingFromVerdict(
      tdb.db,
      findingInput({
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        scanId: scan.id,
        attemptId: attempt.id,
        confidence: "confirmed_by_execution",
      }),
    );
    await triageFinding(tdb.db, {
      workspaceId: f.workspaceId,
      findingId: finding.id,
      toStatus: "pending_verification",
      reason: "patch candidate, replaying",
      actorType: "user",
    });
    const { oracleArtifact, replay } = await openPatchedReplay(f, {
      findingId: finding.id,
      originalScanId: scan.id,
      originalAttemptId: attempt.id,
    });
    const completed = await completeReplay(tdb.db, f.workspaceId, replay.id, {
      oracleEvidenceId: oracleArtifact.id,
      oracleVersion: "bola-oracle-v1",
      baseline: "pass",
      securityCheck: "fail",
      attemptVerdict: "reproduced",
      preconditionsOk: true,
    });
    expect(completed.verdict).toBe("still_vulnerable");
    expect((await getFinding(tdb.db, f.workspaceId, finding.id))?.remediationStatus).toBe(
      "in_progress",
    );
  });

  it("persists evidence and containment alongside attempts", async () => {
    const { f, scan, attempt } = await openScanWithAttempt();
    const artifact = await createEvidenceArtifact(tdb.db, {
      workspaceId: f.workspaceId,
      scanId: scan.id,
      attemptId: attempt.id,
      artifactKind: "redacted_response",
      storageKind: "db",
      storageKey: "obj-redacted-response-0001",
      sha256: "a".repeat(64),
      byteSize: 128,
      contentType: "application/json",
    });
    expect(artifact.redacted).toBe(true);
    expect(await listEvidenceForAttempt(tdb.db, f.workspaceId, attempt.id)).toHaveLength(1);

    await recordContainmentEvent(tdb.db, {
      workspaceId: f.workspaceId,
      scanId: scan.id,
      attemptId: attempt.id,
      runnerId: "11111111-1111-4111-8111-111111111112",
      ruleId: "network.egress_denied",
      policyVersion: "policy-v1",
      deniedOperation: "GET https://evil.example/",
    });
    expect(await listContainmentForScan(tdb.db, f.workspaceId, scan.id)).toHaveLength(1);

    await recordAttemptVerdict(tdb.db, f.workspaceId, attempt.id, {
      oracleVersion: "bola-oracle-v1",
      verdict: "reproduced",
      reasonCode: "cross_account_data_returned",
      positiveControlPassed: true,
      negativeSecurityConditionMet: false,
    });
    // A second verdict for the same attempt is a conflict, not an overwrite.
    await expect(
      recordAttemptVerdict(tdb.db, f.workspaceId, attempt.id, {
        oracleVersion: "bola-oracle-v1",
        verdict: "not_reproduced",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    await recordAuditEvent(tdb.db, {
      workspaceId: f.workspaceId,
      actorUserId: f.ownerId,
      actorType: "user",
      action: "finding.confirmed",
      entityType: "finding",
      entityId: attempt.id,
    });
  });
});
