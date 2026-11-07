import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@highcastle/db";
import { DEMO_IDS, createAuthorizationScope, getScope } from "@highcastle/db";
import { createTestDb } from "@/server/db";
import type { BffDeps } from "@/server/deps";
import { unavailableQueue } from "@/server/queue";
import { createScanFlow } from "@/server/scans";
import { preflightFlow } from "@/server/preflight";
import {
  getAssessmentContextFlow,
  getCurrentScopeFlow,
  getProjectFlow,
  listTargetsFlow,
  meFlow,
} from "@/server/me";

import { demoSession } from "@/server/test-helpers";

const GUEST = demoSession();

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = created.close;
  await markDemoEnvironmentsReady(db, DEMO_IDS.workspaceId);
  return async () => {
    await close();
  };
});

function deps(): BffDeps {
  return {
    db,
    queue: unavailableQueue(),
    session: GUEST,
  };
}

/**
 * Test-only provisioning: flip the seeded demo environments to `ready`,
 * simulating what L19's provisioner does on real infrastructure. Uses L02's
 * exported table objects (public API) — no schema is duplicated.
 */
export async function markDemoEnvironmentsReady(
  db: import("@highcastle/db").Database,
  workspaceId: string,
): Promise<void> {
  const { environments } = await import("@highcastle/db");
  const { eq } = await import("drizzle-orm");
  await db
    .update(environments)
    .set({ provisionStatus: "ready" })
    .where(eq(environments.workspaceId, workspaceId));
}

const PATCHED_SCOPE_ID_FOR_PREFLIGHT = "b2b2b2b2-0000-4000-8000-000000000002";

async function ensurePatchedScopeForPreflight(): Promise<void> {
  const existing = await getScope(
    db,
    DEMO_IDS.workspaceId,
    PATCHED_SCOPE_ID_FOR_PREFLIGHT,
  );
  if (existing) return;
  await createAuthorizationScope(db, {
    id: PATCHED_SCOPE_ID_FOR_PREFLIGHT,
    workspaceId: DEMO_IDS.workspaceId,
    projectId: DEMO_IDS.projectId,
    targetId: DEMO_IDS.targetId,
    actorUserId: DEMO_IDS.ownerUserId,
    version: 1,
    allowedHosts: ["target-lab.internal"],
    allowedPaths: ["/api/invoices"],
    deniedPaths: ["/api/invoices/admin"],
    allowedTestPackIds: ["bola-invoice-v1"],
    allowedMethods: ["GET"],
    maxDurationSeconds: 60,
    maxRequests: 16,
    maxConcurrency: 1,
    maxMemoryMb: 256,
    maxCpuMillicores: 500,
    networkProfileId: "lab-isolated-net",
    permittedEnvironmentId: DEMO_IDS.patchedEnvId,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  });
}

describe("preflight", () => {
  it("passes the exact synthetic lab binding without executing anything", async () => {
    const d = deps();
    const result = await preflightFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: {
        targetId: DEMO_IDS.targetId,
        environmentId: DEMO_IDS.vulnerableEnvId,
        authorizationScopeId: DEMO_IDS.scopeId,
      },
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      data: { ok: boolean; checks: { name: string; passed: boolean }[]; scopeHash: string };
    };
    expect(body.data.ok).toBe(true);
    expect(body.data.checks.length).toBeGreaterThanOrEqual(4);
    expect(body.data.scopeHash).toMatch(/^[0-9a-f]{64}$/);
    // Nothing was enqueued and no scan was created.
    const { listScans } = await import("@highcastle/db");
    const scans = await listScans(db, DEMO_IDS.workspaceId, {
      projectId: DEMO_IDS.projectId,
      limit: 10,
    });
    expect(scans).toHaveLength(0);
  });

  it("fails closed on a forged target", async () => {
    const d = deps();
    await expect(
      preflightFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: {
          targetId: "99999999-9999-4999-8999-999999999999",
          environmentId: DEMO_IDS.vulnerableEnvId,
          authorizationScopeId: DEMO_IDS.scopeId,
        },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("reports an unhealthy environment as a failed check, not an error", async () => {
    const d = deps();
    await ensurePatchedScopeForPreflight();
    // Simulate degraded infrastructure: covered by a scope, but not ready.
    const { environments } = await import("@highcastle/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(environments)
      .set({ provisionStatus: "degraded" })
      .where(eq(environments.id, DEMO_IDS.patchedEnvId));
    const result = await preflightFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: {
        targetId: DEMO_IDS.targetId,
        environmentId: DEMO_IDS.patchedEnvId,
        authorizationScopeId: PATCHED_SCOPE_ID_FOR_PREFLIGHT,
      },
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      data: { ok: boolean; checks: { name: string; passed: boolean }[] };
    };
    expect(body.data.ok).toBe(false);
    expect(
      body.data.checks.find((check) => check.name === "target_healthy"),
    ).toMatchObject({ passed: false });
  });
});

describe("demo session reads", () => {
  it("returns the signed demo session, workspace, and project", async () => {
    const result = await meFlow(deps());
    expect(result.status).toBe(200);
    const body = result.body as {
      data: {
        session: { kind: string; userId: string };
        workspace: { id: string };
        project: { id: string };
      };
    };
    expect(body.data.session.kind).toBe("demo");
    expect(body.data.session.userId).toMatch(/^guest-/);
    expect(body.data.workspace.id).toBe(DEMO_IDS.workspaceId);
    expect(body.data.project.id).toBe(DEMO_IDS.projectId);
  });

  it("serves the wizard assessment context from approved rows only", async () => {
    const result = await getAssessmentContextFlow(deps(), {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      data: {
        project: { id: string; name: string; slug: string };
        targets: {
          target: { id: string; canonicalOrigin: string };
          environment: { id: string; currentRevision: string };
          scope: { id: string; allowedTestPackIds: string[] } | null;
        }[];
      };
    };
    expect(body.data.project.id).toBe(DEMO_IDS.projectId);
    // One entry per seeded environment; only the scope-permitted
    // environment carries the active scope — no free-form hosts.
    expect(body.data.targets.length).toBeGreaterThanOrEqual(1);
    for (const entry of body.data.targets) {
      expect(entry.target.id).toBe(DEMO_IDS.targetId);
      expect(entry.target.canonicalOrigin).toBe("https://target-lab.internal");
    }
    expect(
      body.data.targets.some((entry) => entry.scope !== null),
    ).toBe(true);
  });

  it("denies cross-workspace reads even with a valid demo session", async () => {
    const other = "c0c0c0c0-0000-4000-8000-000000000099";
    await expect(
      getAssessmentContextFlow(deps(), {
        workspaceId: other,
        projectId: DEMO_IDS.projectId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      listTargetsFlow(deps(), {
        workspaceId: other,
        projectId: DEMO_IDS.projectId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("exposes the single lab target and the current scope", async () => {
    const d = deps();
    const targets = await listTargetsFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
    });
    const targetList = (targets.body as { data: { id: string }[] }).data;
    expect(targetList).toHaveLength(1);
    expect(targetList[0]?.id).toBe(DEMO_IDS.targetId);

    const scope = await getCurrentScopeFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
    });
    const scopeData = scope.body as {
      data: { id: string; status: string; permittedEnvironment: { id: string } | null };
    };
    expect(scopeData.data.id).toBe(DEMO_IDS.scopeId);
    expect(scopeData.data.status).toBe("active");
    expect(scopeData.data.permittedEnvironment).not.toBeNull();
  });

  it("reads unknown tenants as missing", async () => {
    const d = deps();
    await expect(
      getProjectFlow(d, {
        workspaceId: "33333333-3333-4333-8333-333333333333",
        projectId: DEMO_IDS.projectId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("creates a scan only after the suite proves the binding", async () => {
    const d: BffDeps = {
      db,
      queue: unavailableQueue(),
      session: GUEST,
    };
    const grant: BffDeps = {
      ...d,
      queue: {
        available: true,
        sendScanJob: async () => {},
        sendReplayJob: async () => {},
        sendCancelScanJob: async () => {},
        close: async () => {},
      },
    };
    const preflight = (await preflightFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: {
        targetId: DEMO_IDS.targetId,
        environmentId: DEMO_IDS.vulnerableEnvId,
        authorizationScopeId: DEMO_IDS.scopeId,
      },
    })).body as { data: { ok: boolean } };
    expect(preflight.data.ok).toBe(true);
    const created = await createScanFlow(grant, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: {
        type: "targeted_red_team",
        environmentId: DEMO_IDS.vulnerableEnvId,
        targetId: DEMO_IDS.targetId,
        authorizationScopeId: DEMO_IDS.scopeId,
        testPackIds: ["bola-invoice-v1"],
      },
      idempotencyKey: "preflight-then-create",
    });
    expect(created.status).toBe(202);
  });
});
