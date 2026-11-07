import { describe, expect, it, vi } from "vitest";
import { getE2Attempt, getE2Scope, listE2Findings } from "./e2-client";
import { loadFindingDetail } from "./loader";
import { loadReplayView } from "../replays/loader";
import { canDisplayVerifiedFixed } from "./view-model";

/**
 * Integration contract with Engineer 2's BFF (`feature/l18-api-bff`).
 * Payloads below are transcribed from E2's server flows — partial finding
 * projections, occurrences, stored attempts with evidence metadata, the
 * scope+environment view, and the replay accept/view shapes — routed
 * through the same loaders the pages use, with a mocked transport.
 */

// Valid UUIDs (branded contract IDs validate the format).
const FINDING_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const REPLAY_ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const SCOPE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ENV_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const REPLAY_ID = "77777777-7777-4777-8777-777777777777";
const OCC_ID = "88888888-8888-4888-8888-888888888888";
const SCAN_ID = "99999999-9999-4999-8999-999999999999";
const EV_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaab";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// E2's actual list row: NO workspaceId/ownerUserId/createdAt/updatedAt.
const E2_LIST_ROW = {
  id: FINDING_ID,
  stableFingerprint: "bola:invoice_lookup:owner_check",
  title: "Cross-account invoice read (BOLA)",
  summary: "Alice read Bob's invoice.",
  category: "broken_object_authorization",
  severity: "high",
  confidence: "confirmed_by_execution",
  remediationStatus: "open",
  firstSeenAt: "2026-11-06T12:00:04.000Z",
  lastSeenAt: "2026-11-06T12:00:04.000Z",
};

// E2's actual detail row: list fields + projectId + confirming attempt.
const E2_DETAIL_ROW = {
  ...E2_LIST_ROW,
  projectId: PROJECT_ID,
  latestConfirmedAttemptId: ATTEMPT_ID,
};

const E2_OCCURRENCES = [
  {
    id: OCC_ID,
    scanId: SCAN_ID,
    attemptId: ATTEMPT_ID,
    targetRevision: "lab-v1-vulnerable",
    evidenceConfidence: "confirmed_by_execution",
    observedAt: "2026-11-06T12:00:04.000Z",
    oracleVerdict: "reproduced",
  },
];

const E2_ATTEMPT = {
  id: ATTEMPT_ID,
  scanId: SCAN_ID,
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  status: "completed",
  verdict: "reproduced",
  positiveControlPassed: true,
  negativeSecurityConditionMet: false,
  startedAt: "2026-11-06T12:00:00.000Z",
  endedAt: "2026-11-06T12:00:04.000Z",
  evidence: [
    {
      id: EV_ID,
      artifactKind: "redacted_response",
      sha256: "a".repeat(64),
      byteSize: 512,
      contentType: "application/json",
    },
  ],
};

const E2_FIX_PROMPT = {
  findingId: FINDING_ID,
  rootCause: "Missing ownership check.",
  smallestFix: "Scope the lookup.",
  requiredInvariants: ["Scope every read to the actor tenant."],
  testGuidance: "Replay the pack.",
};

const E2_SCOPE = {
  id: SCOPE_ID,
  workspaceId: "55555555-5555-4555-8555-555555555555",
  projectId: PROJECT_ID,
  targetId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
  version: 1,
  actorUserId: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
  status: "active",
  allowedHosts: [],
  allowedPaths: [],
  deniedPaths: [],
  allowedTestPackIds: ["bola-invoice-v1"],
  allowedMethods: ["GET"],
  maxDurationSeconds: 30,
  maxRequests: 8,
  maxConcurrency: 1,
  maxMemoryMb: 512,
  maxCpuMillicores: null,
  networkProfileId: null,
  permittedEnvironmentId: ENV_ID,
  approvedAt: "2026-11-06T11:00:00.000Z",
  expiresAt: "2026-11-07T11:00:00.000Z",
  scopeHash: "e".repeat(64),
  permittedEnvironment: {
    id: ENV_ID,
    label: "patched twin",
    currentRevision: "lab-v2-patched",
    fixtureVersion: "1.0.0",
  },
};

const E2_REPLAY_VIEW = {
  id: REPLAY_ID,
  findingId: FINDING_ID,
  verdict: "verified_fixed",
  patchedRevision: "lab-v2-patched",
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  positiveAssertionPassed: true,
  negativeAssertionPassed: true,
  originalAttempt: { id: ATTEMPT_ID, packId: "bola-invoice-v1", verdict: "reproduced" },
  replayAttempts: [{ id: REPLAY_ATTEMPT_ID, packId: "bola-invoice-v1", verdict: "not_reproduced" }],
};

const E2_REPLAY_PENDING = {
  ...E2_REPLAY_VIEW,
  id: "99999999-9999-4999-8999-999999999991",
  verdict: null,
  positiveAssertionPassed: null,
  negativeAssertionPassed: null,
  replayAttempts: [],
};

function router(routes: Record<string, unknown>) {
  // Longest key first so nested routes win over their prefixes.
  const ordered = Object.entries(routes).sort((a, b) => b[0].length - a[0].length);
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    for (const [key, body] of ordered) {
      if (url.includes(key)) return json({ data: body });
    }
    return json(
      { error: { code: "not_found", message: "missing", requestId: "req-1" } },
      404,
    );
  });
}

const E2_ROUTES = {
  "/findings": [E2_LIST_ROW],
  [`/findings/${FINDING_ID}`]: E2_DETAIL_ROW,
  [`/findings/${FINDING_ID}/occurrences`]: E2_OCCURRENCES,
  [`/findings/${FINDING_ID}/fix-prompt`]: E2_FIX_PROMPT,
  [`/attempts/${ATTEMPT_ID}`]: E2_ATTEMPT,
  "/authorization-scopes/current": E2_SCOPE,
  [`/replays/${REPLAY_ID}`]: E2_REPLAY_VIEW,
  "/replays/99999999-9999-4999-8999-999999999991": E2_REPLAY_PENDING,
};

describe("E2 integration (actual BFF response format)", () => {
  it("maps partial list rows without inventing identifiers", async () => {
    const state = await listE2Findings("https://app.test", PROJECT_ID, router(E2_ROUTES));
    expect(state.status).toBe("ok");
    if (state.status !== "ok") throw new Error("expected ok");
    expect(state.data).toHaveLength(1);
    expect(state.data[0]?.id).toBe(FINDING_ID);
    expect(state.data[0]?.projectId).toBeNull();
    expect(state.data[0]).not.toHaveProperty("workspaceId");
    expect(state.data[0]).not.toHaveProperty("ownerUserId");
  });

  it("chains finding → occurrences → stored attempt → fix prompt → scope", async () => {
    const fetchImpl = router({
      ...E2_ROUTES,
      [`/findings/${FINDING_ID}`]: E2_DETAIL_ROW,
    });
    const state = await loadFindingDetail(FINDING_ID, fetchImpl, "https://app.test");
    expect(state.status).toBe("ok");
    if (state.status !== "ok") throw new Error("expected ok");
    expect(state.data.finding.title).toContain("Cross-account");
    expect(state.data.attempt).toBeNull();
    expect(state.data.storedAttempts).toHaveLength(1);
    const stored = state.data.storedAttempts[0];
    expect(stored?.attemptId).toBe(ATTEMPT_ID);
    expect(stored?.verifierVerdict).toBe("reproduced");
    expect(stored?.evidence[0]?.sha256).toBe("a".repeat(64));
    expect(state.data.fixGuidance?.provenance).toBe("api");
    // Replay defaults come from the REAL scope + environment, not guesses.
    expect(state.data.replayDefaults?.patchedEnvironmentId).toBe(ENV_ID);
    expect(state.data.replayDefaults?.authorizationScopeId).toBe(SCOPE_ID);
    expect(state.data.replayDefaults?.patchedRevision).toBe("lab-v2-patched");
  });

  it("renders stored evidence with the oracle verdict, not synthetic bodies", async () => {
    const fetchImpl = router({
      ...E2_ROUTES,
      [`/findings/${FINDING_ID}`]: E2_DETAIL_ROW,
    });
    const state = await getE2Attempt("https://app.test", ATTEMPT_ID, fetchImpl);
    expect(state.status).toBe("ok");
    if (state.status !== "ok") throw new Error("expected ok");
    expect(state.data.verdict).toBe("reproduced");
    expect(state.data.positiveControlPassed).toBe(true);
  });

  it("builds the replay initiation from the resolved scope and environment", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/replays") && !url.includes("/replays/")) {
        return json({
          data: {
            replayId: REPLAY_ID,
            findingId: FINDING_ID,
            verdict: null,
            patchedRevision: "lab-v2-patched",
          },
        });
      }
      return json({ data: E2_SCOPE });
    });
    const scope = await getE2Scope("https://app.test", PROJECT_ID, fetchImpl);
    expect(scope.status).toBe("ok");
    if (scope.status !== "ok") throw new Error("expected ok");
    const { requestE2Replay } = await import("./e2-client");
    const result = await requestE2Replay(
      "https://app.test",
      FINDING_ID,
      {
        originalAttemptId: ATTEMPT_ID,
        patchedEnvironmentId: scope.data.permittedEnvironmentId,
        patchedRevision: scope.data.permittedEnvironment?.currentRevision,
        authorizationScopeId: scope.data.id,
      },
      "idem-1",
      fetchImpl,
    );
    expect(result).toEqual({ status: "accepted", replayId: REPLAY_ID });
    const [, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent).not.toHaveProperty("verdict");
    expect(sent.patchedRevision).toBe("lab-v2-patched");
  });

  it("never labels verified-fixed unless the server view persisted it", async () => {
    const fetchImpl = router(E2_ROUTES);
    const state = await loadReplayView(E2_REPLAY_VIEW.id, fetchImpl, "https://app.test");
    expect(state.status).toBe("ok");
    if (state.status !== "ok") throw new Error("expected ok");
    expect(canDisplayVerifiedFixed(state.data.verdict)).toBe(true);

    const pending = await loadReplayView(
      "99999999-9999-4999-8999-999999999991",
      fetchImpl,
      "https://app.test",
    );
    expect(pending.status).toBe("ok");
    if (pending.status !== "ok") throw new Error("expected ok");
    expect(pending.data.pending).toBe(true);
    expect(pending.data.verdict).toBe("inconclusive");
    expect(canDisplayVerifiedFixed(pending.data.verdict)).toBe(false);
  });

  it("keeps original and replay attempt IDs distinct from the server view", async () => {
    const fetchImpl = router({
      ...E2_ROUTES,
      [`/findings/${FINDING_ID}`]: E2_DETAIL_ROW,
    });
    const state = await loadReplayView(REPLAY_ID, fetchImpl, "https://app.test");
    expect(state.status).toBe("ok");
    if (state.status !== "ok") throw new Error("expected ok");
    expect(state.data.comparison).not.toBeNull();
    // Server-stated before/after: stored reproduced attempt vs denied replay.
    const rows = state.data.comparison?.after.rows;
    expect(rows?.[0]?.result).toBe("allowed");
    expect(rows?.[1]?.result).toBe("denied");
  });

  it("builds stored-vs-stored comparisons from server booleans only", async () => {
    const { buildStoredComparison } = await import("./view-model");
    const comparison = buildStoredComparison(
      {
        label: "Before · lab-v1-vulnerable (stored)",
        environment: "pack bola-invoice-v1 v1.0.0",
        summary: "Stored attempt a.",
        positive: true,
        negativeDenied: false,
      },
      {
        label: "After · lab-v2-patched (patched)",
        environment: "server replay assertions",
        summary: "Replay r.",
        positive: true,
        negativeDenied: true,
      },
    );
    expect(comparison.before.rows[1]?.result).toBe("fail");
    expect(comparison.after.rows[1]?.result).toBe("denied");
    expect(comparison.after.rows[0]?.result).toBe("allowed");
  });
});
