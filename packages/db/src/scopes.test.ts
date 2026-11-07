import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type TestDb } from "./test-utils.js";
import { createAttempt } from "./repos/attempts.js";
import { createScan, listScans } from "./repos/scans.js";
import {
  createAuthorizationScope,
  expireAuthorizationScopes,
  getScope,
  revokeAuthorizationScope,
} from "./repos/scopes.js";
import { createEnvironment, createTarget, updateProject } from "./repos/projects.js";

/**
 * Immutable scopes + transactional integrity.
 *
 * - Scope content is write-once; only `active → revoked|expired` moves.
 * - A revoked/expired scope authorizes nothing (fail-closed).
 * - A failed multi-step write leaves no partial rows behind.
 * - Attempts are idempotent across retries of the same plan.
 */
describe("scopes and transactions", () => {
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

  it("revokes a scope exactly once and freezes its content", async () => {
    const f = await createFixtureChain(tdb.db);
    const before = (await getScope(tdb.db, f.workspaceId, f.scopeId))!;
    const revoked = await revokeAuthorizationScope(tdb.db, f.workspaceId, f.scopeId);
    expect(revoked.status).toBe("revoked");
    const after = (await getScope(tdb.db, f.workspaceId, f.scopeId))!;
    expect(after.scopeHash).toBe(before.scopeHash);
    expect(after.allowedHosts).toEqual(before.allowedHosts);
    expect(after.maxRequests).toBe(before.maxRequests);

    await expect(revokeAuthorizationScope(tdb.db, f.workspaceId, f.scopeId)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("refuses scans under revoked or expired scopes", async () => {
    const f = await createFixtureChain(tdb.db);
    await revokeAuthorizationScope(tdb.db, f.workspaceId, f.scopeId);
    const attempt = {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scopeId: f.scopeId,
      targetId: f.targetId,
      environmentId: f.environmentId,
      targetRevision: f.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: f.ownerId,
    };
    await expect(createScan(tdb.db, attempt)).rejects.toMatchObject({
      code: "scope_denied",
    });
    expect(await listScans(tdb.db, f.workspaceId, { projectId: f.projectId })).toHaveLength(0);

    const g = await createFixtureChain(tdb.db);
    await expireAuthorizationScopes(tdb.db, new Date("2031-01-01T00:00:00Z"));
    const expired = await getScope(tdb.db, g.workspaceId, g.scopeId);
    expect(expired?.status).toBe("expired");
    await expect(
      createScan(tdb.db, {
        workspaceId: g.workspaceId,
        projectId: g.projectId,
        scopeId: g.scopeId,
        targetId: g.targetId,
        environmentId: g.environmentId,
        targetRevision: g.envRevision,
        testPackIds: ["bola-invoice-v1"],
        requestedByUserId: g.ownerId,
      }),
    ).rejects.toMatchObject({ code: "scope_denied" });
  });

  it("a failed scan creation leaves no partial rows", async () => {
    const f = await createFixtureChain(tdb.db);
    await expect(
      createScan(tdb.db, {
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        scopeId: "00000000-0000-4000-8000-000000000000",
        targetId: f.targetId,
        environmentId: f.environmentId,
        targetRevision: f.envRevision,
        testPackIds: ["bola-invoice-v1"],
        requestedByUserId: f.ownerId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await listScans(tdb.db, f.workspaceId, { projectId: f.projectId })).toHaveLength(0);
  });

  it("attempt retries reuse the same row", async () => {
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
    const input = {
      workspaceId: f.workspaceId,
      scanId: scan.id,
      packId: "bola-invoice-v1" as const,
      packVersion: "1.0.0",
      planHash: "plan-retry",
      scopeHash: f.scopeHash,
      targetRevision: f.envRevision,
    };
    const first = await createAttempt(tdb.db, input);
    const second = await createAttempt(tdb.db, input);
    expect(second.id).toBe(first.id);
  });

  it("refuses scope approval for an unverified target", async () => {
    const f = await createFixtureChain(tdb.db);
    const draft = await createTarget(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      label: "unverified",
      canonicalOrigin: "https://target-lab.internal",
      targetKind: "demo",
    });
    await expect(
      createAuthorizationScope(tdb.db, {
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        targetId: draft.id,
        actorUserId: f.ownerId,
        allowedHosts: ["target-lab"],
        allowedPaths: ["/api/invoices"],
        allowedTestPackIds: ["bola-invoice-v1"],
        allowedMethods: ["GET"],
        maxDurationSeconds: 60,
        maxRequests: 16,
        maxConcurrency: 1,
        maxMemoryMb: 256,
        permittedEnvironmentId: f.environmentId,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "scope_denied" });
  });

  it("refuses scope approval for an archived project", async () => {
    const f = await createFixtureChain(tdb.db);
    await updateProject(tdb.db, f.workspaceId, f.projectId, { lifecycle: "archived" });
    await expect(
      createAuthorizationScope(tdb.db, {
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
        permittedEnvironmentId: f.environmentId,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "scope_denied" });
  });

  it("refuses scope approval when the environment belongs to another project", async () => {
    const f = await createFixtureChain(tdb.db);
    const g = await createFixtureChain(tdb.db);
    await expect(
      createAuthorizationScope(tdb.db, {
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
        permittedEnvironmentId: g.environmentId,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses scans outside the permitted environment, pack or revision", async () => {
    const f = await createFixtureChain(tdb.db);
    const otherEnv = await createEnvironment(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      label: "other",
      kind: "staging",
      currentRevision: "lab-v1-vulnerable",
      fixtureVersion: "1.0.0",
      provisionStatus: "ready",
    });
    const base = {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      scopeId: f.scopeId,
      targetId: f.targetId,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: f.ownerId,
    };
    // Wrong environment (not the scope's permitted one).
    await expect(
      createScan(tdb.db, {
        ...base,
        environmentId: otherEnv.id,
        targetRevision: "lab-v1-vulnerable",
      }),
    ).rejects.toMatchObject({ code: "scope_denied" });
    // Unapproved test pack.
    await expect(
      createScan(tdb.db, {
        ...base,
        environmentId: f.environmentId,
        targetRevision: f.envRevision,
        testPackIds: ["bola-invoice-v1", "unknown-pack"],
      }),
    ).rejects.toMatchObject({ code: "scope_denied" });
    // Stale revision: evidence would be attributed to the wrong build.
    await expect(
      createScan(tdb.db, {
        ...base,
        environmentId: f.environmentId,
        targetRevision: "lab-v0-ancient",
      }),
    ).rejects.toMatchObject({ code: "stale_revision" });
  });

  it("refuses scans when the permitted environment is not ready", async () => {
    const f = await createFixtureChain(tdb.db);
    const pendingEnv = await createEnvironment(tdb.db, {
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      label: "provisioning twin",
      kind: "attack_twin",
      currentRevision: "lab-v1-vulnerable",
      fixtureVersion: "1.0.0",
      provisionStatus: "provisioning",
    });
    // Scope approval does not require readiness (approval may precede
    // provisioning), but execution does.
    const pendingScope = await createAuthorizationScope(tdb.db, {
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
      permittedEnvironmentId: pendingEnv.id,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    await expect(
      createScan(tdb.db, {
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        scopeId: pendingScope.id,
        targetId: f.targetId,
        environmentId: pendingEnv.id,
        targetRevision: "lab-v1-vulnerable",
        testPackIds: ["bola-invoice-v1"],
        requestedByUserId: f.ownerId,
      }),
    ).rejects.toMatchObject({ code: "unprocessable" });
  });
});
