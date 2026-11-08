import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@highcastle/db";
import { DEMO_IDS, DbError, transitionScan } from "@highcastle/db";
import { createTestDb } from "@/server/db";
import type { BffDeps } from "@/server/deps";
import { clientIp, dbErrorResponse } from "@/server/http";
import { cancelScanFlow, createScanFlow } from "@/server/scans";
import { scanAdmissionFor } from "@/server/admission";

import { demoSession } from "@/server/test-helpers";

/**
 * Public-demo admission control (issue #83).
 *
 * Proves the server-side cap is enforced in the actual scan creation flow —
 * not just advisory preflight: ten simultaneous submissions cannot exceed
 * the ceiling, rejected requests create no scan and enqueue no job, and
 * idempotent retries still return their original scan at the cap.
 */

const GUEST = demoSession();

let db: Database;
let close: () => Promise<void>;

const ENV_KEYS = [
  "SCAN_MAX_ACTIVE_PER_PROJECT",
  "SCAN_MAX_ACTIVE_PER_WORKSPACE",
  "SCAN_MAX_ACTIVE_PER_TARGET",
  "SCAN_GUEST_MAX_PER_HOUR",
  "SCAN_GUEST_MAX_PER_DAY",
  "SCAN_USER_MAX_PER_HOUR",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  const created = await createTestDb();
  db = created.db;
  close = created.close;
  await markDemoEnvironmentsReady(db, DEMO_IDS.workspaceId);
  return async () => {
    await close();
  };
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function markDemoEnvironmentsReady(db: Database, workspaceId: string): Promise<void> {
  const { environments } = await import("@highcastle/db");
  const { eq } = await import("drizzle-orm");
  await db
    .update(environments)
    .set({ provisionStatus: "ready" })
    .where(eq(environments.workspaceId, workspaceId));
}

function deps(overrides: Partial<BffDeps> = {}): BffDeps {
  return {
    db,
    queue: {
      available: true,
      sendScanJob: async () => {},
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

function create(deps_: BffDeps, key: string) {
  return createScanFlow(deps_, {
    workspaceId: DEMO_IDS.workspaceId,
    projectId: DEMO_IDS.projectId,
    body: scanBody(),
    idempotencyKey: key,
  });
}

describe("scan admission (public demo)", () => {
  it("caps ten simultaneous submissions at the active-scan ceiling", async () => {
    const sent: string[] = [];
    const d = deps({
      queue: {
        available: true,
        sendScanJob: async (job: { scanId: string }) => {
          sent.push(job.scanId);
        },
        sendReplayJob: async () => {},
        sendCancelScanJob: async () => {},
        close: async () => {},
      },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => create(d, `race-${i}`)),
    );
    const admitted = results.filter((r) => r.status === "fulfilled" && r.value.status === 202);
    const rejected = results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof DbError &&
        (r.reason as DbError).code === "quota_exceeded",
    );
    expect(admitted).toHaveLength(5);
    expect(rejected).toHaveLength(5);
    // No job was enqueued for a rejected submission.
    expect(sent).toHaveLength(5);
    // And the rejection maps to the typed 429 contract error.
    const failure = rejected[0] as PromiseRejectedResult;
    const response = dbErrorResponse(failure.reason, "req-test");
    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quota_exceeded");
  });

  it("replays an idempotent request at the cap instead of rejecting it", async () => {
    const d = deps();
    const first = await create(d, "stable-key");
    expect(first.status).toBe(202);
    // Fill the remaining slots with other keys.
    for (let i = 0; i < 4; i += 1) {
      await create(d, `fill-${i}`);
    }
    // At cap: a NEW key is rejected with quota_exceeded...
    await expect(create(d, "one-too-many")).rejects.toMatchObject({
      code: "quota_exceeded",
    });
    // ...but the same Idempotency-Key returns the original scan (200).
    const retry = await create(d, "stable-key");
    expect(retry.status).toBe(200);
    expect((retry.body as { data: { scanId: string } }).data.scanId).toBe(
      (first.body as { data: { scanId: string } }).data.scanId,
    );
  });

  it("rate-limits new scans per guest session via the durable ledger", async () => {
    process.env["SCAN_MAX_ACTIVE_PER_PROJECT"] = "50";
    process.env["SCAN_MAX_ACTIVE_PER_TARGET"] = "50";
    process.env["SCAN_GUEST_MAX_PER_HOUR"] = "2";
    const d = deps();
    await create(d, "w-1");
    await create(d, "w-2");
    await expect(create(d, "w-3")).rejects.toMatchObject({
      code: "rate_limited",
    });
    // A different guest session has its own budget.
    const other = deps({ session: demoSession() });
    const admitted = await create(other, "other-1");
    expect(admitted.status).toBe(202);
  });

  it("preserves cancellation at the cap and frees the slot once terminal", async () => {
    const d = deps();
    const scans: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await create(d, `c-${i}`);
      scans.push((res.body as { data: { scanId: string } }).data.scanId);
    }
    // Cancellation is an allowed mutation at the cap — not admission-gated.
    const canceled = await cancelScanFlow(d, {
      scanId: scans[0]!,
      workspaceId: DEMO_IDS.workspaceId,
    });
    expect(canceled.status).toBe(200);
    // Still non-terminal until the worker drains it: a new scan is rejected.
    await expect(create(d, "still-full")).rejects.toMatchObject({
      code: "quota_exceeded",
    });
    // Once the worker completes cancellation the slot frees for real scans.
    await transitionScan(db, DEMO_IDS.workspaceId, scans[0]!, { to: "canceled" });
    const admitted = await create(d, "after-cancel");
    expect(admitted.status).toBe(202);
  });

  it("derives subject identity from the session, never from client input", () => {
    const demo = scanAdmissionFor(GUEST);
    expect(demo.subject?.key).toBe(`demo:${GUEST.sessionId}`);
    const account = scanAdmissionFor({
      kind: "account",
      userId: "u-1",
      sessionId: "s-1",
      expiresAt: Date.now() + 1000,
    });
    expect(account.subject?.key).toBe("account:u-1");
  });
});

describe("trusted proxy client identity (issue #83)", () => {
  const KEY = "TRUST_PROXY";
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[KEY];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  it("ignores all forwarded headers when the proxy is not trusted", () => {
    delete process.env[KEY];
    const request = new Request("https://app.test/", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(clientIp(request)).toBe("unknown");
  });

  it("uses the rightmost (proxy-appended) hop, never the client-supplied chain", () => {
    process.env[KEY] = "1";
    const request = new Request("https://app.test/", {
      headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.7" },
    });
    // 9.9.9.9 and 8.8.8.8 are attacker-controlled; Caddy appended the real
    // remote address last — that is the only trustworthy value.
    expect(clientIp(request)).toBe("203.0.113.7");
  });

  it("falls back to unknown for a missing or empty forwarded header", () => {
    process.env[KEY] = "1";
    expect(clientIp(new Request("https://app.test/"))).toBe("unknown");
    expect(
      clientIp(
        new Request("https://app.test/", {
          headers: { "x-forwarded-for": " , " },
        }),
      ),
    ).toBe("unknown");
  });
});
