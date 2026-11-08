import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type TestDb } from "./test-utils.js";
import { createAttempt, createEvidenceArtifact } from "./repos/attempts.js";
import { createReplay, upsertFindingFromVerdict } from "./repos/findings.js";
import { createScan } from "./repos/scans.js";
import {
  findArtifactTenant,
  findAttemptTenant,
  findFindingTenant,
  findProjectTenant,
  findReplayTenant,
  findScanTenant,
} from "./repos/tenancy.js";
import {
  accountWorkspaceSlug,
  ensureAccountWorkspace,
  getUserPreferences,
  getWorkspaceMember,
  listUserWorkspaces,
  removeWorkspaceMember,
  setExperienceMode,
} from "./repos/workspaces.js";

/**
 * Account tenancy (issue #72 / E12): idempotent first-workspace
 * provisioning, tenant-authorized user→workspace listing, revocation that
 * sticks, and resource→tenant resolution for unscoped API routes.
 */
describe("account tenancy", () => {
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

  const USER_A = "d0000000-0000-4000-8000-00000000000a";
  const USER_B = "d0000000-0000-4000-8000-00000000000b";

  it("provisions the first workspace idempotently (first login)", async () => {
    const first = await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    expect(first.created).toBe(true);
    expect(first.memberships).toHaveLength(1);
    const membership = first.memberships[0]!;
    expect(membership.role).toBe("owner");
    expect(membership.workspace.slug).toBe(accountWorkspaceSlug(USER_A));
    expect(membership.workspace.ownerUserId).toBe(USER_A);
    // Default preferences row created inside the same transaction.
    expect((await getUserPreferences(tdb.db, USER_A))?.experienceMode).toBe("builder");
  });

  it("repeated logins return the same workspace, never a duplicate", async () => {
    const first = await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    const second = await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    const third = await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.memberships[0]!.workspace.id).toBe(first.memberships[0]!.workspace.id);
    expect(await listUserWorkspaces(tdb.db, USER_A)).toHaveLength(1);
  });

  it("two different users get isolated workspaces", async () => {
    const a = await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    const b = await ensureAccountWorkspace(tdb.db, { userId: USER_B });
    expect(a.memberships[0]!.workspace.id).not.toBe(b.memberships[0]!.workspace.id);
    const aList = await listUserWorkspaces(tdb.db, USER_A);
    const bList = await listUserWorkspaces(tdb.db, USER_B);
    expect(aList.map((m) => m.workspace.id)).toEqual([a.memberships[0]!.workspace.id]);
    expect(bList.map((m) => m.workspace.id)).toEqual([b.memberships[0]!.workspace.id]);
    // A holds no membership row in B's tenant.
    expect(await getWorkspaceMember(tdb.db, b.memberships[0]!.workspace.id, USER_A)).toBeNull();
  });

  it("membership revocation sticks — provisioning never resurrects access", async () => {
    const { memberships } = await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    const workspaceId = memberships[0]!.workspace.id;
    await removeWorkspaceMember(tdb.db, workspaceId, USER_A);
    expect(await listUserWorkspaces(tdb.db, USER_A)).toHaveLength(0);
    // The derived-slug tombstone blocks silent re-provisioning.
    const again = await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    expect(again.created).toBe(false);
    expect(again.memberships).toHaveLength(0);
    expect(await getWorkspaceMember(tdb.db, workspaceId, USER_A)).toBeNull();
  });

  it("persists the per-account experience mode", async () => {
    await ensureAccountWorkspace(tdb.db, { userId: USER_A });
    await setExperienceMode(tdb.db, USER_A, "developer");
    expect((await getUserPreferences(tdb.db, USER_A))?.experienceMode).toBe("developer");
    // Upsert creates the row even before provisioning ran for a user.
    await setExperienceMode(tdb.db, USER_B, "developer");
    expect((await getUserPreferences(tdb.db, USER_B))?.experienceMode).toBe("developer");
  });

  it("find*Tenant resolves the owning workspace for unscoped routes", async () => {
    const fx = await createFixtureChain(tdb.db);
    const scan = await createScan(tdb.db, {
      workspaceId: fx.workspaceId,
      projectId: fx.projectId,
      scopeId: fx.scopeId,
      targetId: fx.targetId,
      environmentId: fx.environmentId,
      targetRevision: fx.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: fx.ownerId,
    });
    const attempt = await createAttempt(tdb.db, {
      workspaceId: fx.workspaceId,
      scanId: scan.id,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "a".repeat(64),
      scopeHash: fx.scopeHash,
      targetRevision: fx.envRevision,
    });
    const finding = await upsertFindingFromVerdict(tdb.db, {
      workspaceId: fx.workspaceId,
      projectId: fx.projectId,
      stableFingerprint: "fp-tenant-resolution",
      title: "BOLA between tenants",
      summary: "Alice read Bob's invoice",
      category: "broken_object_authorization",
      severity: "high",
      confidence: "confirmed_by_execution",
      scanId: scan.id,
      attemptId: attempt.id,
      targetRevision: fx.envRevision,
      oracleVerdict: "reproduced",
    });
    const replay = await createReplay(tdb.db, {
      workspaceId: fx.workspaceId,
      projectId: fx.projectId,
      findingId: finding.finding.id,
      originalAttemptId: attempt.id,
      originalScanId: scan.id,
      patchedRevision: "lab-v2-patched",
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
    });
    const artifact = await createEvidenceArtifact(tdb.db, {
      workspaceId: fx.workspaceId,
      scanId: scan.id,
      attemptId: attempt.id,
      artifactKind: "redacted_response",
      storageKind: "db",
      storageKey: "evidence/tenant-resolution-test",
      sha256: "b".repeat(64),
    });

    expect((await findProjectTenant(tdb.db, fx.projectId))?.workspaceId).toBe(fx.workspaceId);
    expect((await findScanTenant(tdb.db, scan.id))?.workspaceId).toBe(fx.workspaceId);
    expect((await findScanTenant(tdb.db, scan.id))?.projectId).toBe(fx.projectId);
    expect((await findAttemptTenant(tdb.db, attempt.id))?.workspaceId).toBe(fx.workspaceId);
    expect((await findFindingTenant(tdb.db, finding.finding.id))?.workspaceId).toBe(fx.workspaceId);
    expect((await findReplayTenant(tdb.db, replay.id))?.workspaceId).toBe(fx.workspaceId);
    expect((await findArtifactTenant(tdb.db, artifact.id))?.workspaceId).toBe(fx.workspaceId);

    const unknown = "00000000-0000-4000-8000-000000000000";
    expect(await findProjectTenant(tdb.db, unknown)).toBeNull();
    expect(await findScanTenant(tdb.db, unknown)).toBeNull();
    expect(await findAttemptTenant(tdb.db, unknown)).toBeNull();
    expect(await findFindingTenant(tdb.db, unknown)).toBeNull();
    expect(await findReplayTenant(tdb.db, unknown)).toBeNull();
    expect(await findArtifactTenant(tdb.db, unknown)).toBeNull();
  });
});
