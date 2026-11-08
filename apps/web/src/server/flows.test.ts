import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@highcastle/db";
import {
  DEMO_IDS,
  createAttempt,
  createAuthorizationScope,
  createEvidenceArtifact,
  getReplay,
  getScope,
  getTarget,
  listFindings,
  recordAttemptVerdict,
  recordContainmentEvent,
  upsertFindingFromVerdict,
} from "@highcastle/db";
import { createTestDb } from "@/server/db";
import type { BffDeps } from "@/server/deps";
import { unavailableQueue, type JobQueue } from "@/server/queue";
import {
  fixPromptFlow,
  getFindingFlow,
  listFindingsFlow,
  listOccurrencesFlow,
} from "@/server/findings";
import { FindingOccurrenceSchema, FindingSchema } from "@highcastle/contracts";
import { createReplayFlow, getReplayFlow } from "@/server/replays";
import { getArtifactFlow } from "@/server/artifacts";
import { createScanFlow, listContainmentFlow } from "@/server/scans";

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

function fakeQueue(calls: { scans: string[]; replays: string[] }): JobQueue {
  return {
    available: true,
    sendScanJob: async (job: { scanId: string }) => {
      calls.scans.push(job.scanId);
    },
    sendReplayJob: async (job: { replayId: string }) => {
      calls.replays.push(job.replayId);
    },
    sendCancelScanJob: async () => {},
    close: async () => {},
  };
}

function deps(calls = { scans: [] as string[], replays: [] as string[] }): {
  deps: BffDeps;
  calls: typeof calls;
} {
  return {
    deps: {
      db,
      queue: fakeQueue(calls),
      session: GUEST,
    },
    calls,
  };
}

async function seedFindingFixture(d: BffDeps) {
  const created = (
    await createScanFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      body: {
        type: "targeted_red_team",
        environmentId: DEMO_IDS.vulnerableEnvId,
        targetId: DEMO_IDS.targetId,
        authorizationScopeId: DEMO_IDS.scopeId,
        testPackIds: ["bola-invoice-v1"],
      },
      idempotencyKey: "fixture-scan",
    })
  ).body as { data: { scanId: string } };
  const scanId = created.data.scanId;
  const attempt = await createAttempt(db, {
    workspaceId: DEMO_IDS.workspaceId,
    scanId,
    packId: "bola-invoice-v1",
    packVersion: "1.0.0",
    planHash: "a".repeat(64),
    scopeHash: "b".repeat(64),
    targetRevision: "lab-v1-vulnerable",
  });
  await recordAttemptVerdict(db, DEMO_IDS.workspaceId, attempt.id, {
    oracleVersion: "bola-oracle-v1",
    verdict: "reproduced",
    positiveControlPassed: true,
    negativeSecurityConditionMet: false,
  });
  await upsertFindingFromVerdict(db, {
    workspaceId: DEMO_IDS.workspaceId,
    projectId: DEMO_IDS.projectId,
    stableFingerprint: "bola:invoice_lookup:owner_check",
    title: "Invoice object authorization bypass",
    summary: "Alice reads Bob's invoice via direct id lookup",
    category: "broken_object_authorization",
    severity: "high",
    confidence: "confirmed_by_execution",
    scanId,
    attemptId: attempt.id,
    targetRevision: "lab-v1-vulnerable",
    oracleVerdict: "reproduced",
  });
  const artifact = await createEvidenceArtifact(db, {
    workspaceId: DEMO_IDS.workspaceId,
    scanId,
    attemptId: attempt.id,
    artifactKind: "redacted_response",
    storageKind: "db",
    storageKey: `tenant-demo/artifacts/${"0".repeat(32)}`,
    sha256: "c".repeat(64),
    byteSize: 512,
    contentType: "application/json",
  });
  await recordContainmentEvent(db, {
    workspaceId: DEMO_IDS.workspaceId,
    scanId,
    attemptId: attempt.id,
    runnerId: "11111111-1111-4111-8111-111111111111",
    ruleId: "network.egress_denied",
    policyVersion: "policy-v1",
    deniedOperation: "egress to 169.254.169.254:80",
    safeMetadata: { host: "169.254.169.254", port: 80 },
  });
  const findings = await listFindings(db, DEMO_IDS.workspaceId, {
    projectId: DEMO_IDS.projectId,
  });
  const created2 = findings[0];
  if (!created2) throw new Error("fixture finding missing");
  return { scanId, attemptId: attempt.id, findingId: created2.id, artifactId: artifact.id };
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

/**
 * A second demo approval covering the patched environment, mirroring the
 * seed's grant shape. Replays execute under this scope; scans stay under the
 * seeded vulnerable-env scope. Created through L02's repository, never
 * hand-inserted.
 */
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

describe("findings and fix prompts", () => {
  it("lists, reads, and explains a confirmed finding from real evidence", async () => {
    const { deps: d } = deps();
    const fixture = await seedFindingFixture(d);

    const listed = (
      await listFindingsFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
      })
    ).body as { data: { id: string }[] };
    expect(listed.data.map((row) => row.id)).toContain(fixture.findingId);

    const filtered = (
      await listFindingsFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        severity: "low",
      })
    ).body as { data: unknown[] };
    expect(filtered.data).toEqual([]);

    const single = (
      await getFindingFlow(d, {
        findingId: fixture.findingId,
        workspaceId: DEMO_IDS.workspaceId,
      })
    ).body as { data: unknown };
    // Strict contract: the dashboard and findings UI parse FindingSchema,
    // so every mandatory field must be present and valid.
    const parsedFinding = FindingSchema.safeParse(single.data);
    expect(parsedFinding.success).toBe(true);
    if (parsedFinding.success) {
      expect(parsedFinding.data.confidence).toBe("confirmed_by_execution");
      expect(parsedFinding.data.workspaceId).toBe(DEMO_IDS.workspaceId);
      expect(parsedFinding.data.projectId).toBe(DEMO_IDS.projectId);
    }

    const occurrences = (
      await listOccurrencesFlow(d, {
        findingId: fixture.findingId,
        workspaceId: DEMO_IDS.workspaceId,
      })
    ).body as { data: unknown[] };
    expect(occurrences.data).toHaveLength(1);
    const parsedOccurrence = FindingOccurrenceSchema.safeParse(occurrences.data[0]);
    expect(parsedOccurrence.success).toBe(true);
    if (parsedOccurrence.success) {
      expect(parsedOccurrence.data.oracleVerdict).toBe("reproduced");
    }

    const prompt = (
      await fixPromptFlow(d, {
        findingId: fixture.findingId,
        workspaceId: DEMO_IDS.workspaceId,
      })
    ).body as {
      data: {
        findingId: string;
        rootCause: string;
        requiredInvariants: string[];
      };
    };
    expect(prompt.data.findingId).toBe(fixture.findingId);
    expect(prompt.data.rootCause).toContain(fixture.attemptId);
    expect(prompt.data.requiredInvariants.length).toBeGreaterThanOrEqual(1);
  });

  it("reads unknown findings as missing", async () => {
    const { deps: d } = deps();
    await expect(
      getFindingFlow(d, {
        findingId: "99999999-9999-4999-8999-999999999999",
        workspaceId: DEMO_IDS.workspaceId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("containment and artifacts", () => {
  it("lists runtime containment evidence without leaking tenant data", async () => {
    const { deps: d } = deps();
    const fixture = await seedFindingFixture(d);
    const result = (
      await listContainmentFlow(d, {
        scanId: fixture.scanId,
        workspaceId: DEMO_IDS.workspaceId,
      })
    ).body as {
      data: { ruleId: string; allowed: boolean; runtimeEnforced: boolean }[];
    };
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      ruleId: "network.egress_denied",
      allowed: false,
      runtimeEnforced: true,
    });
    await expect(
      listContainmentFlow(d, {
        scanId: fixture.scanId,
        workspaceId: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("returns redacted artifact metadata with an honest download state", async () => {
    const { deps: d } = deps();
    const fixture = await seedFindingFixture(d);
    const result = (
      await getArtifactFlow(d, {
        artifactId: fixture.artifactId,
        workspaceId: DEMO_IDS.workspaceId,
      })
    ).body as {
      data: {
        sha256: string;
        redacted: boolean;
        storageKey?: string;
        download: { available: boolean };
      };
    };
    expect(result.data.sha256).toBe("c".repeat(64));
    expect(result.data.redacted).toBe(true);
    expect(result.data.storageKey).toBeUndefined();
    expect(result.data.download.available).toBe(false);
    await expect(
      getArtifactFlow(d, {
        artifactId: fixture.artifactId,
        workspaceId: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("replays", () => {
  it("starts a patched replay from a reproduced attempt and reads its verdict", async () => {
    const { deps: d, calls } = deps();
    await ensurePatchedScope();
    const fixture = await seedFindingFixture(d);
    const created = await createReplayFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      findingId: fixture.findingId,
      body: {
        originalAttemptId: fixture.attemptId,
        patchedEnvironmentId: DEMO_IDS.patchedEnvId,
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: PATCHED_SCOPE_ID,
      },
    });
    expect(created.status).toBe(202);
    const replay = (created.body as { data: { replayId: string; verdict: null } }).data;
    expect(calls.replays).toEqual([replay.replayId]);

    const fetched = (
      await getReplayFlow(d, {
        replayId: replay.replayId,
        workspaceId: DEMO_IDS.workspaceId,
      })
    ).body as {
      data: { verdict: null; originalAttempt: { verdict: string } };
    };
    expect(fetched.data.verdict).toBeNull();
    expect(fetched.data.originalAttempt.verdict).toBe("reproduced");
  });

  it("provisions a fresh patched-env scope when the presented scope binds the wrong target", async () => {
    const { deps: d } = deps();
    // The seed suite's PATCHED_SCOPE_ID binds the vulnerable-env target —
    // the exact wrong-triple shape that caused issue #82.
    await ensurePatchedScope();
    const fixture = await seedFindingFixture(d);
    const originalScope = await getScope(db, DEMO_IDS.workspaceId, DEMO_IDS.scopeId);
    const originalHash = originalScope?.scopeHash;

    const created = await createReplayFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      findingId: fixture.findingId,
      body: {
        originalAttemptId: fixture.attemptId,
        patchedEnvironmentId: DEMO_IDS.patchedEnvId,
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: PATCHED_SCOPE_ID,
      },
    });
    expect(created.status).toBe(202);
    const replayId = (created.body as { data: { replayId: string } }).data.replayId;
    const replay = await getReplay(db, DEMO_IDS.workspaceId, replayId);
    // The replay does NOT reuse the wrong-triple presented scope.
    expect(replay?.approvalScopeId).not.toBe(PATCHED_SCOPE_ID);
    const provisioned = await getScope(db, DEMO_IDS.workspaceId, replay!.approvalScopeId!);
    expect(provisioned?.permittedEnvironmentId).toBe(DEMO_IDS.patchedEnvId);
    // L04 relation gate: the provisioned scope's target lives in the
    // patched environment — never the vulnerable-env target.
    const boundTarget = await getTarget(db, DEMO_IDS.workspaceId, provisioned!.targetId);
    expect(boundTarget?.environmentId).toBe(DEMO_IDS.patchedEnvId);
    // Grant bounds copied, not widened.
    expect(provisioned?.allowedTestPackIds).toEqual(originalScope?.allowedTestPackIds);
    expect(provisioned?.allowedMethods).toEqual(originalScope?.allowedMethods);
    // The original approval is untouched — no mutation, same immutable hash.
    const after = await getScope(db, DEMO_IDS.workspaceId, DEMO_IDS.scopeId);
    expect(after?.scopeHash).toBe(originalHash);
    expect(after?.permittedEnvironmentId).toBe(DEMO_IDS.vulnerableEnvId);
  });

  it("uses a client-presented scope that already binds the patched triple", async () => {
    const { deps: d } = deps();
    // First replay provisions the patched target + scope; a second replay
    // should reuse the presented valid scope rather than minting again.
    const fixture = await seedFindingFixture(d);
    const first = await createReplayFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      findingId: fixture.findingId,
      body: {
        originalAttemptId: fixture.attemptId,
        patchedEnvironmentId: DEMO_IDS.patchedEnvId,
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: DEMO_IDS.scopeId,
      },
    });
    expect(first.status).toBe(202);
    const firstReplayId = (first.body as { data: { replayId: string } }).data.replayId;
    const firstReplay = await getReplay(db, DEMO_IDS.workspaceId, firstReplayId);
    const second = await createReplayFlow(d, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      findingId: fixture.findingId,
      body: {
        originalAttemptId: fixture.attemptId,
        patchedEnvironmentId: DEMO_IDS.patchedEnvId,
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: firstReplay!.approvalScopeId!,
      },
    });
    expect(second.status).toBe(202);
    const secondReplayId = (second.body as { data: { replayId: string } }).data.replayId;
    const secondReplay = await getReplay(db, DEMO_IDS.workspaceId, secondReplayId);
    expect(secondReplay?.approvalScopeId).toBe(firstReplay?.approvalScopeId);
  });

  it("rejects client-supplied verdicts and non-reproduced originals", async () => {
    const { deps: d } = deps();
    const fixture = await seedFindingFixture(d);
    await expect(
      createReplayFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        findingId: fixture.findingId,
        body: {
          originalAttemptId: fixture.attemptId,
          patchedEnvironmentId: DEMO_IDS.patchedEnvId,
          patchedRevision: "lab-v2-patched",
          authorizationScopeId: DEMO_IDS.scopeId,
          verdict: "verified_fixed",
        },
      }),
    ).rejects.toMatchObject({ code: "validation_error" });

    const other = await createAttempt(db, {
      workspaceId: DEMO_IDS.workspaceId,
      scanId: fixture.scanId,
      packId: "bola-invoice-v1",
      packVersion: "1.0.0",
      planHash: "d".repeat(64),
      scopeHash: "e".repeat(64),
      targetRevision: "lab-v1-vulnerable",
    });
    await recordAttemptVerdict(db, DEMO_IDS.workspaceId, other.id, {
      oracleVersion: "bola-oracle-v1",
      verdict: "not_reproduced",
    });
    await expect(
      createReplayFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        findingId: fixture.findingId,
        body: {
          originalAttemptId: other.id,
          patchedEnvironmentId: DEMO_IDS.patchedEnvId,
          patchedRevision: "lab-v2-patched",
          authorizationScopeId: DEMO_IDS.scopeId,
        },
      }),
    ).rejects.toMatchObject({ code: "unprocessable" });
  });

  it("rejects stale revisions and fails closed without a queue", async () => {
    const { deps: d } = deps();
    await ensurePatchedScope();
    const fixture = await seedFindingFixture(d);
    await expect(
      createReplayFlow(d, {
        workspaceId: DEMO_IDS.workspaceId,
        projectId: DEMO_IDS.projectId,
        findingId: fixture.findingId,
        body: {
          originalAttemptId: fixture.attemptId,
          patchedEnvironmentId: DEMO_IDS.patchedEnvId,
          patchedRevision: "lab-v9-future",
          authorizationScopeId: PATCHED_SCOPE_ID,
        },
      }),
    ).rejects.toMatchObject({ code: "stale_revision" });

    const noQueue: BffDeps = { ...d, queue: unavailableQueue() };
    const result = await createReplayFlow(noQueue, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      findingId: fixture.findingId,
      body: {
        originalAttemptId: fixture.attemptId,
        patchedEnvironmentId: DEMO_IDS.patchedEnvId,
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: PATCHED_SCOPE_ID,
      },
    });
    expect(result.status).toBe(503);

    // A reachable API with a dead broker fails closed the same way: the
    // replay id is returned so the client can recover, never a faked 202.
    const brokerDown: BffDeps = {
      ...d,
      queue: {
        ...unavailableQueue(),
        available: true,
        sendReplayJob: async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
        },
      },
    };
    const failed = await createReplayFlow(brokerDown, {
      workspaceId: DEMO_IDS.workspaceId,
      projectId: DEMO_IDS.projectId,
      findingId: fixture.findingId,
      body: {
        originalAttemptId: fixture.attemptId,
        patchedEnvironmentId: DEMO_IDS.patchedEnvId,
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: PATCHED_SCOPE_ID,
      },
    });
    expect(failed.status).toBe(503);
    const failedBody = failed.body as {
      error: { code: string; details: { replayId: string } };
    };
    expect(failedBody.error.code).toBe("unavailable");
    const reread = await getReplayFlow(brokerDown, {
      replayId: failedBody.error.details.replayId,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect(reread.status).toBe(200);
  });
});
