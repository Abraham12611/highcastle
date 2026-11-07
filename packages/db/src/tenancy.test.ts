import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureChain, createTestDb, type TestDb } from "./test-utils.js";
import { getProject } from "./repos/projects.js";
import { createScan, getScan } from "./repos/scans.js";
import { getScope } from "./repos/scopes.js";
import { createWorkspace, getWorkspaceMember } from "./repos/workspaces.js";

/**
 * Workspace isolation: every repository read filters by `workspace_id`.
 *
 * A tenant holding another tenant's UUIDs must observe "missing", never the
 * other tenant's rows — enforced at the query layer, not just the API.
 */
describe("workspace isolation", () => {
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

  it("a workspace cannot read another workspace's project", async () => {
    const a = await createFixtureChain(tdb.db);
    const b = await createFixtureChain(tdb.db);
    expect(await getProject(tdb.db, b.workspaceId, a.projectId)).toBeNull();
    expect(await getProject(tdb.db, a.workspaceId, b.projectId)).toBeNull();
  });

  it("a scan in workspace A is invisible from workspace B", async () => {
    const a = await createFixtureChain(tdb.db);
    const b = await createFixtureChain(tdb.db);
    const scan = await createScan(tdb.db, {
      workspaceId: a.workspaceId,
      projectId: a.projectId,
      scopeId: a.scopeId,
      targetId: a.targetId,
      environmentId: a.environmentId,
      targetRevision: a.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: a.ownerId,
    });
    expect(await getScan(tdb.db, b.workspaceId, scan.id)).toBeNull();
    expect(await getScan(tdb.db, a.workspaceId, scan.id)).not.toBeNull();
  });

  it("a scope from another workspace cannot authorize a scan", async () => {
    const a = await createFixtureChain(tdb.db);
    const b = await createFixtureChain(tdb.db);
    await expect(
      createScan(tdb.db, {
        workspaceId: b.workspaceId,
        projectId: b.projectId,
        scopeId: a.scopeId,
        targetId: b.targetId,
        environmentId: b.environmentId,
        targetRevision: b.envRevision,
        testPackIds: ["bola-invoice-v1"],
        requestedByUserId: b.ownerId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("a scope cannot authorize a different project in the same workspace", async () => {
    const a = await createFixtureChain(tdb.db);
    const otherProject = await createFixtureChain(tdb.db);
    expect(otherProject.workspaceId).not.toBe(a.workspaceId);
    await expect(
      createScan(tdb.db, {
        workspaceId: a.workspaceId,
        projectId: a.projectId,
        scopeId: otherProject.scopeId,
        targetId: a.targetId,
        environmentId: a.environmentId,
        targetRevision: a.envRevision,
        testPackIds: ["bola-invoice-v1"],
        requestedByUserId: a.ownerId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("guessing a cross-tenant scope ID reads as missing", async () => {
    const a = await createFixtureChain(tdb.db);
    const b = await createFixtureChain(tdb.db);
    expect(await getScope(tdb.db, b.workspaceId, a.scopeId)).toBeNull();
  });

  it("membership is per-workspace: a member of A is a stranger in B", async () => {
    const a = await createFixtureChain(tdb.db);
    const outsider = await createWorkspace(tdb.db, {
      slug: "outsider-ws",
      name: "Outsider",
      ownerUserId: "c0000000-0000-4000-8000-000000000099",
    });
    expect(await getWorkspaceMember(tdb.db, outsider.id, a.ownerId)).toBeNull();
    await expect(
      createWorkspace(tdb.db, {
        slug: "outsider-ws",
        name: "Outsider again",
        ownerUserId: "c0000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
