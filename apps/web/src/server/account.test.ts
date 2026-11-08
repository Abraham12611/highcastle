import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_IDS,
  addWorkspaceMember,
  createAttempt,
  createAuthorizationScope,
  createEnvironment,
  createProject,
  createScan,
  createTarget,
  createWorkspace,
  findProjectTenant,
  findScanTenant,
  getScan,
  upsertFindingFromVerdict,
  removeWorkspaceMember,
  verifyTarget,
  type Database,
} from "@highcastle/db";
import { createTestDb } from "@/server/db";
import type { BffDeps } from "@/server/deps";
import type { JobQueue } from "@/server/queue";
import { internalUserIdForClerk } from "@/server/auth/membership";
import { authorizeResourceTenant } from "@/server/authz";
import {
  createProjectFlow,
  createTargetFlow,
  createWorkspaceFlow,
  listProjectsFlow,
  listWorkspacesFlow,
  meFlow,
  updatePreferencesFlow,
} from "@/server/me";
import { cancelScanFlow, createScanFlow, getScanFlow } from "@/server/scans";
import { createReplayFlow } from "@/server/replays";
import { preflightFlow } from "@/server/preflight";
import { fixPromptFlow } from "@/server/findings";
import { accountSession, demoSession } from "@/server/test-helpers";

/**
 * Account-session tenancy (issue #72 / E12): first login provisioning,
 * repeated login stability, two-user isolation, membership revocation, and
 * cross-workspace guessed IDs — all through the real PGlite database and
 * the real membership repo, never mocked.
 */

const CLERK_A = "user_e12_alice";
const CLERK_B = "user_e12_bob";
const USER_A = internalUserIdForClerk(CLERK_A);
const USER_B = internalUserIdForClerk(CLERK_B);

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = created.close;
  return async () => {
    await close();
  };
});

const queue: JobQueue = {
  available: false,
  sendScanJob: async () => {},
  sendReplayJob: async () => {},
  sendCancelScanJob: async () => {},
  close: async () => {},
};

function depsFor(userId: string): BffDeps {
  return { db, queue, session: accountSession(userId) };
}

interface OwnedTenant {
  workspaceId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  scopeId: string;
  envRevision: string;
}

/** A second tenant with a full project/target/scope chain (owner = userId). */
async function seedOwnedTenant(userId: string, slug: string): Promise<OwnedTenant> {
  const ws = await createWorkspace(db, {
    slug: `${slug}-ws`,
    name: `${slug} workspace`,
    ownerUserId: userId,
  });
  const project = await createProject(db, {
    workspaceId: ws.id,
    slug: `${slug}-project`,
    name: `${slug} project`,
    kind: "repo",
    createdBy: userId,
  });
  const env = await createEnvironment(db, {
    workspaceId: ws.id,
    projectId: project.id,
    label: `${slug}-env`,
    kind: "attack_twin",
    currentRevision: "rev-1",
    fixtureVersion: "1.0.0",
    provisionStatus: "ready",
  });
  const target = await createTarget(db, {
    workspaceId: ws.id,
    projectId: project.id,
    environmentId: env.id,
    label: `${slug}-target`,
    canonicalOrigin: "https://owned.example.internal",
    targetKind: "staging",
  });
  await verifyTarget(db, ws.id, target.id, {
    method: "manual_review",
    verifiedBy: userId,
  });
  const scope = await createAuthorizationScope(db, {
    workspaceId: ws.id,
    projectId: project.id,
    targetId: target.id,
    actorUserId: userId,
    allowedHosts: ["owned.example.internal"],
    allowedPaths: ["/api/**"],
    allowedTestPackIds: ["bola-invoice-v1"],
    allowedMethods: ["GET"],
    maxDurationSeconds: 60,
    maxRequests: 4,
    maxConcurrency: 1,
    maxMemoryMb: 256,
    permittedEnvironmentId: env.id,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  });
  return {
    workspaceId: ws.id,
    projectId: project.id,
    environmentId: env.id,
    targetId: target.id,
    scopeId: scope.id,
    envRevision: "rev-1",
  };
}

function dataOf<T = Record<string, unknown>>(result: { status: number; body: unknown }): T {
  return (result.body as { data: T }).data;
}

describe("GET /api/v1/me + workspace discovery (account sessions)", () => {
  it("first login provisions a workspace with owner membership", async () => {
    const deps = depsFor(USER_A);
    const result = await meFlow(deps);
    expect(result.status).toBe(200);
    const data = dataOf(result);
    expect(data.session).toMatchObject({ kind: "account", userId: USER_A });
    const workspaces = data.workspaces as { id: string; role: string; slug: string }[];
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]!.role).toBe("owner");
    expect(workspaces[0]!.slug).toBe(`u-${USER_A}`);
    expect(data.workspace).toMatchObject({ id: workspaces[0]!.id });
    expect(data.preferences).toMatchObject({ experienceMode: "builder" });
  });

  it("repeated login returns the same workspace (idempotent)", async () => {
    const deps = depsFor(USER_A);
    const first = dataOf(await meFlow(deps));
    const second = dataOf(await meFlow(deps));
    const c = dataOf<{ id: string }[]>(await listWorkspacesFlow(deps));
    const a = first.workspaces as { id: string }[];
    const b = second.workspaces as { id: string }[];
    expect(b[0]!.id).toBe(a[0]!.id);
    expect(c.map((w) => w.id)).toEqual([a[0]!.id]);
  });

  it("two different users see only their own workspaces", async () => {
    const a = dataOf(await meFlow(depsFor(USER_A)));
    const b = dataOf(await meFlow(depsFor(USER_B)));
    const aIds = (a.workspaces as { id: string }[]).map((w) => w.id);
    const bIds = (b.workspaces as { id: string }[]).map((w) => w.id);
    expect(aIds).toHaveLength(1);
    expect(bIds).toHaveLength(1);
    expect(aIds[0]).not.toBe(bIds[0]);
    // A's list contains only A's tenant — the seeded demo tenant is invisible.
    const demoVisible = aIds.includes(DEMO_IDS.workspaceId);
    expect(demoVisible).toBe(false);
  });

  it("membership revocation removes the workspace and blocks re-provisioning", async () => {
    const deps = depsFor(USER_A);
    const first = dataOf(await meFlow(deps));
    const workspaceId = (first.workspaces as { id: string }[])[0]!.id;
    await removeWorkspaceMember(db, workspaceId, USER_A);
    const listed = await listWorkspacesFlow(deps);
    expect(dataOf(listed)).toEqual([]);
    // The revoked workspace does not silently come back on the next request.
    const again = dataOf(await meFlow(deps));
    expect(again.workspaces).toEqual([]);
    expect(again.workspace).toBeNull();
  });
});

describe("account preferences (PATCH /api/v1/me/preferences)", () => {
  it("persists the experience mode for the account", async () => {
    const deps = depsFor(USER_A);
    const updated = await updatePreferencesFlow(deps, {
      body: { experienceMode: "developer" },
    });
    expect(updated.status).toBe(200);
    expect(dataOf(updated)).toMatchObject({ experienceMode: "developer" });
    const me = dataOf(await meFlow(deps));
    expect(me.preferences).toMatchObject({ experienceMode: "developer" });
  });

  it("rejects an invalid mode and demo sessions", async () => {
    const deps = depsFor(USER_A);
    await expect(
      updatePreferencesFlow(deps, { body: { experienceMode: "wizard" } }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      updatePreferencesFlow(
        { db, queue, session: demoSession() },
        { body: { experienceMode: "builder" } },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("unscoped resource tenant resolution (issue #72)", () => {
  it("account can read its own project/scan through the unscoped seam", async () => {
    const deps = depsFor(USER_A);
    await meFlow(deps); // provision
    const tenant = dataOf<{ id: string }[]>(await listWorkspacesFlow(deps));
    const ws = tenant[0]!.id;
    const project = await createProject(db, {
      workspaceId: ws,
      slug: "own-project",
      name: "Own",
      kind: "repo",
      createdBy: USER_A,
    });
    const env = await createEnvironment(db, {
      workspaceId: ws,
      projectId: project.id,
      label: "env",
      kind: "attack_twin",
      currentRevision: "rev-1",
      fixtureVersion: "1.0.0",
      provisionStatus: "ready",
    });
    const target = await createTarget(db, {
      workspaceId: ws,
      projectId: project.id,
      environmentId: env.id,
      label: "t",
      canonicalOrigin: "https://owned.example.internal",
      targetKind: "staging",
    });
    await verifyTarget(db, ws, target.id, {
      method: "manual_review",
      verifiedBy: USER_A,
    });
    const scope = await createAuthorizationScope(db, {
      workspaceId: ws,
      projectId: project.id,
      targetId: target.id,
      actorUserId: USER_A,
      allowedHosts: ["owned.example.internal"],
      allowedPaths: ["/api/**"],
      allowedTestPackIds: ["bola-invoice-v1"],
      allowedMethods: ["GET"],
      maxDurationSeconds: 60,
      maxRequests: 4,
      maxConcurrency: 1,
      maxMemoryMb: 256,
      permittedEnvironmentId: env.id,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    const scan = await createScan(db, {
      workspaceId: ws,
      projectId: project.id,
      scopeId: scope.id,
      targetId: target.id,
      environmentId: env.id,
      targetRevision: "rev-1",
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: USER_A,
    });
    const resolved = await authorizeResourceTenant(db, deps.session, () =>
      findScanTenant(db, scan.id),
    );
    const result = await getScanFlow(deps, {
      scanId: scan.id,
      workspaceId: resolved.workspaceId,
    });
    expect(result.status).toBe(200);
    expect(dataOf(result)).toMatchObject({ scanId: scan.id, status: "queued" });
  });

  it("cross-workspace guessed IDs read as not-found, never leaked", async () => {
    // USER_B owns a fully seeded tenant; USER_A has no membership in it.
    const foreign = await seedOwnedTenant(USER_B, "foreign");
    const foreignScan = await createScan(db, {
      workspaceId: foreign.workspaceId,
      projectId: foreign.projectId,
      scopeId: foreign.scopeId,
      targetId: foreign.targetId,
      environmentId: foreign.environmentId,
      targetRevision: foreign.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: USER_B,
    });
    const depsA = depsFor(USER_A);
    await meFlow(depsA); // provision A's own tenant
    for (const lookup of [
      () => findScanTenant(db, foreignScan.id),
      () => findProjectTenant(db, foreign.projectId),
    ]) {
      await expect(authorizeResourceTenant(db, depsA.session, lookup)).rejects.toMatchObject({
        code: "not_found",
      });
    }
    // And B can still resolve its own tenant — the denial is about
    // membership, not existence.
    const depsB = depsFor(USER_B);
    const resolved = await authorizeResourceTenant(db, depsB.session, () =>
      findScanTenant(db, foreignScan.id),
    );
    expect(resolved.workspaceId).toBe(foreign.workspaceId);
    expect(await getScan(db, foreign.workspaceId, foreignScan.id)).not.toBeNull();
  });

  it("revoked members lose access to previously readable resources", async () => {
    const foreign = await seedOwnedTenant(USER_A, "revokeme");
    const depsA = depsFor(USER_A);
    await meFlow(depsA); // provision A's own tenant too
    // A holds a membership in `foreign` (it owns it). Remove it.
    await removeWorkspaceMember(db, foreign.workspaceId, USER_A);
    await expect(
      authorizeResourceTenant(db, depsA.session, () => findProjectTenant(db, foreign.projectId)),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("demo sessions stay pinned — a demo cannot reach account resources", async () => {
    const foreign = await seedOwnedTenant(USER_A, "demoforeign");
    const foreignScan = await createScan(db, {
      workspaceId: foreign.workspaceId,
      projectId: foreign.projectId,
      scopeId: foreign.scopeId,
      targetId: foreign.targetId,
      environmentId: foreign.environmentId,
      targetRevision: foreign.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: USER_A,
    });
    const demo = demoSession();
    const resolved = await authorizeResourceTenant(db, demo, () =>
      findScanTenant(db, foreignScan.id),
    );
    // Pinned demo workspace — the scoped fetch then reads the foreign scan
    // as missing (404), identical to a nonexistent id.
    expect(resolved.workspaceId).toBe(DEMO_IDS.workspaceId);
    expect(await getScan(db, resolved.workspaceId, foreignScan.id)).toBeNull();
  });
});

describe("workspace + project creation (account mutations)", () => {
  it("POST /api/v1/workspaces creates a second workspace owned by the caller", async () => {
    const deps = depsFor(USER_A);
    await meFlow(deps);
    const created = await createWorkspaceFlow(deps, {
      body: { name: "Client Work", slug: "client-work" },
    });
    expect(created.status).toBe(201);
    expect(dataOf(created)).toMatchObject({
      slug: "client-work",
      name: "Client Work",
      role: "owner",
    });
    const listed = dataOf<{ slug: string }[]>(await listWorkspacesFlow(deps));
    expect(listed.map((w) => w.slug)).toContain("client-work");
  });

  it("duplicate workspace slug reads as conflict", async () => {
    const deps = depsFor(USER_A);
    await createWorkspaceFlow(deps, { body: { name: "One", slug: "dup" } });
    await expect(
      createWorkspaceFlow(deps, { body: { name: "Two", slug: "dup" } }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("POST /workspaces/:wid/projects creates a draft project for owner/admin only", async () => {
    const depsA = depsFor(USER_A);
    await meFlow(depsA);
    const aWs = dataOf<{ id: string }[]>(await listWorkspacesFlow(depsA))[0]!.id;
    const created = await createProjectFlow(depsA, {
      workspaceId: aWs,
      body: { name: "Invoices", kind: "repo" },
    });
    expect(created.status).toBe(201);
    expect(dataOf(created)).toMatchObject({ slug: "invoices", lifecycle: "draft" });
    const projects = dataOf<{ slug: string }[]>(
      await listProjectsFlow(depsA, { workspaceId: aWs }),
    );
    expect(projects.map((p) => p.slug)).toEqual(["invoices"]);

    // A viewer cannot create projects.
    const depsB = depsFor(USER_B);
    await addWorkspaceMember(db, { workspaceId: aWs, userId: USER_B, role: "viewer" });
    await expect(
      createProjectFlow(depsB, { workspaceId: aWs, body: { name: "Nope" } }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // A non-member cannot even see the workspace (not_found, not 403).
    const stranger = internalUserIdForClerk("user_e12_stranger");
    const depsStranger = depsFor(stranger);
    await meFlow(depsStranger);
    await expect(
      createProjectFlow(depsStranger, { workspaceId: aWs, body: { name: "Nope" } }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("demo sessions cannot create workspaces or projects", async () => {
    const demoDeps: BffDeps = { db, queue, session: demoSession() };
    await expect(createWorkspaceFlow(demoDeps, { body: { name: "x" } })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      createProjectFlow(demoDeps, {
        workspaceId: DEMO_IDS.workspaceId,
        body: { name: "x" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("demo session behavior is preserved", () => {
  it("GET /api/v1/me still returns the pinned synthetic bindings", async () => {
    const result = await meFlow({ db, queue, session: demoSession() });
    expect(result.status).toBe(200);
    const data = dataOf(result);
    expect(data.session).toMatchObject({ kind: "demo" });
    expect(data.workspace).toMatchObject({ id: DEMO_IDS.workspaceId });
    expect(data.project).toMatchObject({ id: DEMO_IDS.projectId });
  });
});

describe("stable internal user mapping (E5 seam)", () => {
  it("the same Clerk subject always derives the same internal user", () => {
    expect(internalUserIdForClerk(CLERK_A)).toBe(USER_A);
    expect(internalUserIdForClerk(CLERK_A)).not.toBe(USER_B);
    // And it is the identity provisioning keys on.
    expect(internalUserIdForClerk(CLERK_A)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("role enforcement on mutations (issue #72 release gate)", () => {
  const VIEWER = internalUserIdForClerk("user_e12_viewer");
  const DEVELOPER = internalUserIdForClerk("user_e12_dev");

  async function seedRoles() {
    const tenant = await seedOwnedTenant(USER_A, "roles");
    await addWorkspaceMember(db, {
      workspaceId: tenant.workspaceId,
      userId: VIEWER,
      role: "viewer",
    });
    await addWorkspaceMember(db, {
      workspaceId: tenant.workspaceId,
      userId: DEVELOPER,
      role: "developer",
    });
    return tenant;
  }

  function scanBody(t: OwnedTenant) {
    return {
      type: "targeted_red_team",
      environmentId: t.environmentId,
      targetId: t.targetId,
      authorizationScopeId: t.scopeId,
      testPackIds: ["bola-invoice-v1"],
    };
  }

  it("viewer is read-only: every mutation answers 403 forbidden", async () => {
    const t = await seedRoles();
    const deps = depsFor(VIEWER);
    const scan = await createScan(db, {
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      scopeId: t.scopeId,
      targetId: t.targetId,
      environmentId: t.environmentId,
      targetRevision: t.envRevision,
      testPackIds: ["bola-invoice-v1"],
      requestedByUserId: USER_A,
    });
    const attempt = await createAttempt(db, {
      workspaceId: t.workspaceId,
      scanId: scan.id,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "c".repeat(64),
      scopeHash: "d".repeat(64),
      targetRevision: t.envRevision,
    });
    const finding = await upsertFindingFromVerdict(db, {
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      stableFingerprint: "fp-roles",
      title: "t",
      summary: "s",
      category: "broken_object_authorization",
      severity: "high",
      confidence: "confirmed_by_execution",
      scanId: scan.id,
      attemptId: attempt.id,
      targetRevision: t.envRevision,
      oracleVerdict: "reproduced",
    });
    const mutations: Promise<unknown>[] = [
      createScanFlow(deps, {
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        body: scanBody(t),
        idempotencyKey: "viewer-scan",
      }),
      cancelScanFlow(deps, { workspaceId: t.workspaceId, scanId: scan.id }),
      createReplayFlow(deps, {
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        findingId: finding.finding.id,
        body: {
          originalAttemptId: attempt.id,
          patchedEnvironmentId: t.environmentId,
          patchedRevision: "rev-2",
          authorizationScopeId: t.scopeId,
        },
      }),
      preflightFlow(deps, {
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        body: {
          targetId: t.targetId,
          environmentId: t.environmentId,
          authorizationScopeId: t.scopeId,
        },
      }),
      fixPromptFlow(deps, {
        workspaceId: t.workspaceId,
        findingId: finding.finding.id,
      }),
      createProjectFlow(deps, {
        workspaceId: t.workspaceId,
        body: { name: "v" },
      }),
      createTargetFlow(deps, {
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        body: {
          label: "x",
          canonicalOrigin: "https://x.example",
          targetKind: "staging",
        },
      }),
    ];
    for (const mutation of mutations) {
      await expect(mutation).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("developer gets operational actions but not management actions", async () => {
    const t = await seedRoles();
    const deps = depsFor(DEVELOPER);
    // Operational: create a scan inside the approved scope → accepted.
    const created = await createScanFlow(deps, {
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      body: scanBody(t),
      idempotencyKey: "dev-scan",
    });
    expect(created.status).toBe(202);
    const scanId = (dataOf(created) as { scanId: string }).scanId;
    // Operational: cancel it.
    const canceled = await cancelScanFlow(deps, {
      workspaceId: t.workspaceId,
      scanId,
    });
    expect(canceled.status).toBe(200);
    // Operational: preflight (launch reconnaissance check).
    const pre = await preflightFlow(deps, {
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      body: {
        targetId: t.targetId,
        environmentId: t.environmentId,
        authorizationScopeId: t.scopeId,
      },
    });
    expect(pre.status).toBe(200);
    // Management: denied.
    await expect(
      createProjectFlow(deps, { workspaceId: t.workspaceId, body: { name: "x" } }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createTargetFlow(deps, {
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        body: { label: "x", canonicalOrigin: "https://x.example", targetKind: "staging" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("owner can register a draft target; demo and non-members cannot", async () => {
    const t = await seedRoles();
    const deps = depsFor(USER_A);
    const created = await createTargetFlow(deps, {
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      body: {
        label: "staging-site",
        canonicalOrigin: "https://staging.example.internal",
        targetKind: "staging",
      },
    });
    expect(created.status).toBe(201);
    expect(dataOf(created)).toMatchObject({ state: "draft" });
    // Non-member: 404 (existence hidden), not 403.
    const stranger = depsFor(internalUserIdForClerk("user_e12_stranger2"));
    await expect(
      createTargetFlow(stranger, {
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        body: { label: "x", canonicalOrigin: "https://x.example", targetKind: "staging" },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    // Demo session: still forbidden — the lab binding is unchanged.
    await expect(
      createTargetFlow({ db, queue, session: demoSession() }, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: { label: "x", canonicalOrigin: "https://x.example", targetKind: "demo" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("revoked membership restores nothing: mutations read as missing", async () => {
    const t = await seedRoles();
    const deps = depsFor(DEVELOPER);
    await removeWorkspaceMember(db, t.workspaceId, DEVELOPER);
    await expect(
      createScanFlow(deps, {
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        body: scanBody(t),
        idempotencyKey: "revoked-scan",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    // And lazy provisioning does not hand them a route back into that tenant.
    const list = dataOf<{ id: string }[]>(await listWorkspacesFlow(deps));
    expect(list.map((w) => w.id)).not.toContain(t.workspaceId);
  });
});
