import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@highcastle/db";
import { DEMO_IDS, createAuthorizationScope, getScope } from "@highcastle/db";
import { createTestDb } from "@/server/db";
import type { BffDeps } from "@/server/deps";
import { unavailableQueue } from "@/server/queue";
import {
  cancelScanFlow,
  createScanFlow,
  getScanFlow,
  listAttemptsFlow,
  listContainmentFlow,
  listEventsFlow,
  listScansFlow,
} from "@/server/scans";

/**
 * Scan lifecycle integration tests against real Postgres semantics
 * (PGlite + L02 migrations + demo seed). The queue is faked to prove the
 * enqueue contract; the unavailable queue proves the fail-closed path.
 */

const GUEST = { kind: "guest" } as const;

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

function deps(overrides: Partial<BffDeps> = {}): BffDeps {
  const sent: string[] = [];
  return {
    db,
    queue: {
      available: true,
      sendScanJob: async (scanId: string) => {
        sent.push(scanId);
      },
      sendReplayJob: async () => {},
      sendCancelScanJob: async () => {},
      close: async () => {},
    },
    session: GUEST,
    ...overrides,
  };
}

function scanBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "targeted_red_team",
    environmentId: DEMO_IDS.vulnerableEnvId,
    targetId: DEMO_IDS.targetId,
    authorizationScopeId: DEMO_IDS.scopeId,
    testPackIds: ["bola-invoice-v1"],
    ...overrides,
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

const PATCHED_SCOPE_ID = "b1b1b1b1-0000-4000-8000-000000000001";

async function ensurePatchedScope(): Promise<string> {
  const existing = await getScope(db, DEMO_IDS.workspaceId, PATCHED_SCOPE_ID);
  if (existing) return existing.id;
  const created = await createAuthorizationScope(db, {
    id: PATCHED_SCOPE_ID,
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
  return created.id;
}

describe("scan lifecycle", () => {
  it("creates a scan, persists it, enqueues the job, and reads it back", async () => {
    const sent: string[] = [];
    const d = deps({
      queue: {
        available: true,
        sendScanJob: async (scanId: string) => {
          sent.push(scanId);
        },
        sendReplayJob: async () => {},
        sendCancelScanJob: async () => {},
        close: async () => {},
      },
    });
    const created = await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "scan-key-1",
    });
    expect(created.status).toBe(202);
    const data = created.body as { data: { scanId: string } };
    expect(sent).toEqual([data.data.scanId]);

    const fetched = await getScanFlow(d, {
      scanId: data.data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect(fetched.status).toBe(200);
    const summary = (fetched.body as { data: { status: string; terminal: boolean } }).data;
    expect(summary.status).toBe("queued");
    expect(summary.terminal).toBe(false);
  });

  it("is idempotent: the same key returns the same scan with dedupe keys", async () => {
    const sentKeys: (string | undefined)[] = [];
    const d = deps({
      queue: {
        available: true,
        sendScanJob: async (_scanId: string, options?: { singletonKey?: string }) => {
          sentKeys.push(options?.singletonKey);
        },
        sendReplayJob: async () => {},
        sendCancelScanJob: async () => {},
        close: async () => {},
      },
    });
    const first = await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "dup-key",
    });
    const second = await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "dup-key",
    });
    expect(first.status).toBe(202);
    // Duplicate: same scan, no second history entry, 200, same singleton key.
    expect(second.status).toBe(200);
    expect((second.body as { data: { scanId: string } }).data.scanId).toBe(
      (first.body as { data: { scanId: string } }).data.scanId,
    );
    expect(sentKeys).toEqual(["dup-key", "dup-key"]);
    const events = await listEventsFlow(d, {
      scanId: (first.body as { data: { scanId: string } }).data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
      after: 0,
    });
    const requested = (
      events.body as { data: { eventType: string }[] }
    ).data.filter((event) => event.eventType === "scan.requested");
    expect(requested).toHaveLength(1);
  });

  it("rejects scan creation without an idempotency key", async () => {
    const d = deps();
    await expect(
      createScanFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: scanBody(),
        idempotencyKey: null,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("rejects forged targets, environments, packs, and scopes", async () => {
    const d = deps();
    const patchedScope = await ensurePatchedScope();
    const evil = "99999999-9999-4999-8999-999999999999";
    // Forged target outside the fixed lab: denied even though the scope is real.
    await expect(
      createScanFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: scanBody({ targetId: evil }),
        idempotencyKey: "k1",
      }),
    ).rejects.toMatchObject({ code: "policy_denied" });
    // Unknown scope id: reads as missing, never as another tenant's grant.
    await expect(
      createScanFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: scanBody({ authorizationScopeId: evil }),
        idempotencyKey: "k2",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    // Real scope that does not cover this environment: scope_denied, so a
    // client cannot borrow an approval to reach another environment.
    await expect(
      createScanFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: scanBody({ authorizationScopeId: patchedScope }),
        idempotencyKey: "k3",
      }),
    ).rejects.toMatchObject({ code: "scope_denied" });
    // Unknown environment id: the fixed-lab binding denies it before any
    // store lookup, so no existence signal leaks.
    await expect(
      createScanFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: scanBody({ environmentId: evil }),
        idempotencyKey: "k4",
      }),
    ).rejects.toMatchObject({ code: "policy_denied" });
    // Unknown pack id: rejected by the contract before any policy check.
    await expect(
      createScanFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: scanBody({ testPackIds: ["nmap-full"] }),
        idempotencyKey: "k5",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("fails closed with 503 when the queue is not configured", async () => {
    const d = deps({ queue: unavailableQueue() });
    const result = await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "no-queue-key",
    });
    expect(result.status).toBe(503);
    const body = result.body as { error: { code: string; details: { scanId: string } } };
    expect(body.error.code).toBe("unavailable");
    // The scan row still exists and stays queued for an operator.
    const fetched = await getScanFlow(d, {
      scanId: body.error.details.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect(fetched.status).toBe(200);
  });

  it("fails closed with 503 and the scan id when the broker is unreachable", async () => {
    const brokerDown: BffDeps["queue"] = {
      ...deps().queue,
      sendScanJob: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      },
    };
    const d = deps({ queue: brokerDown });
    const result = await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "broker-down-key",
    });
    expect(result.status).toBe(503);
    const body = result.body as { error: { code: string; details: { scanId: string } } };
    expect(body.error.code).toBe("unavailable");
    // Recoverable: the persisted scan is readable, and the same
    // idempotency key re-attempts enqueue once the broker is back.
    const fetched = await getScanFlow(d, {
      scanId: body.error.details.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect(fetched.status).toBe(200);
  });

  it("reports honestly whether a cancel reached the worker", async () => {
    const d = deps();
    const make = (key: string) =>
      createScanFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        body: scanBody(),
        idempotencyKey: key,
      });
    const first = (await make("cancel-notify-1")).body as { data: { scanId: string } };
    const ok = (await cancelScanFlow(d, {
      scanId: first.data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    })).body as { data: { workerNotified: boolean } };
    expect(ok.data.workerNotified).toBe(true);

    const second = (await make("cancel-notify-2")).body as { data: { scanId: string } };
    const quiet = await cancelScanFlow(deps({ queue: unavailableQueue() }), {
      scanId: second.data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    // Cancellation still lands (the DB flag is the mechanism), but the
    // response admits the worker was not notified.
    expect(quiet.status).toBe(200);
    expect(
      (quiet.body as { data: { status: string; workerNotified: boolean } }).data,
    ).toMatchObject({ workerNotified: false });
  });

  it("cancels a scan and reads empty attempts/containment/events", async () => {
    const d = deps();
    const created = (await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "cancel-key",
    })).body as { data: { scanId: string } };
    const canceled = await cancelScanFlow(d, {
      scanId: created.data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect(canceled.status).toBe(200);
    const attempts = await listAttemptsFlow(d, {
      scanId: created.data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect((attempts.body as { data: unknown[] }).data).toEqual([]);
    const containment = await listContainmentFlow(d, {
      scanId: created.data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect((containment.body as { data: unknown[] }).data).toEqual([]);
    const events = await listEventsFlow(d, {
      scanId: created.data.scanId,
      workspaceId: DEMO_IDS.workspaceId,
      after: 0,
    });
    const history = (events.body as { data: { seq: number; eventType: string }[] }).data;
    expect(history.map((event) => event.eventType)).toContain("scan.requested");
    expect(history.map((event) => event.seq)).toEqual(
      [...history.map((event) => event.seq)].sort((a, b) => a - b),
    );
  });

  it("reads another tenant's scan as missing", async () => {
    const d = deps();
    const created = (await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "iso-key",
    })).body as { data: { scanId: string } };
    await expect(
      getScanFlow(d, {
        scanId: created.data.scanId,
        workspaceId: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists scans for the project", async () => {
    const d = deps();
    await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: scanBody(),
      idempotencyKey: "list-key",
    });
    const listed = await listScansFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      limit: 20,
    });
    expect(listed.status).toBe(200);
    expect(((listed.body as { data: unknown[] }).data).length).toBeGreaterThanOrEqual(1);
  });

  it("reads unknown scans as missing", async () => {
    const d = deps();
    await expect(
      getScanFlow(d, {
        scanId: "99999999-9999-4999-8999-999999999999",
        workspaceId: DEMO_IDS.workspaceId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
