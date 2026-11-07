import { describe, expect, it, vi } from "vitest";
import { getFinding, getFixPrompt, getReplay, listFindings, requestReplay } from "./api-client";

const FINDING = {
  id: "44444444-4444-4444-8444-444444444444",
  workspaceId: "55555555-5555-4555-8555-555555555555",
  projectId: "66666666-6666-4666-8666-666666666666",
  stableFingerprint: "bola:invoice_lookup:owner_check",
  title: "Cross-account invoice read (BOLA)",
  summary: "Alice read Bob's invoice.",
  category: "broken_object_authorization",
  severity: "high",
  confidence: "confirmed_by_execution",
  remediationStatus: "open",
  firstSeenAt: "2026-11-06T12:00:04.000Z",
  lastSeenAt: "2026-11-06T12:00:04.000Z",
  latestConfirmedAttemptId: "22222222-2222-4222-8222-222222222222",
  ownerUserId: null,
  createdAt: "2026-11-06T12:00:04.000Z",
  updatedAt: "2026-11-06T12:00:04.000Z",
};

const REPLAY = {
  id: "77777777-7777-4777-8777-777777777777",
  workspaceId: "55555555-5555-4555-8555-555555555555",
  projectId: "66666666-6666-4666-8666-666666666666",
  findingId: "44444444-4444-4444-8444-444444444444",
  originalAttemptId: "22222222-2222-4222-8222-222222222222",
  originalScanId: "88888888-8888-4888-8888-888888888888",
  replayScanId: "99999999-9999-4999-8999-999999999999",
  patchedEnvironmentId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  patchedRevision: "lab-v2-patched",
  approvalScopeId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  packId: "bola-invoice-v1",
  packVersion: "1.0.0",
  positiveAssertionPassed: true,
  negativeAssertionPassed: true,
  verdict: "verified_fixed",
  createdAt: "2026-11-06T12:05:00.000Z",
  completedAt: "2026-11-06T12:05:04.000Z",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("findings API client", () => {
  it("lists findings from the contracted envelope", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [FINDING] }));
    const state = await listFindings("https://app.test", "proj-1", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://app.test/api/v1/projects/proj-1/findings",
      expect.objectContaining({ method: "GET" }),
    );
    expect(state.status).toBe("ok");
    if (state.status === "ok") {
      expect(state.data).toHaveLength(1);
      expect(state.data[0]?.severity).toBe("high");
      expect(state.source).toEqual({ kind: "api" });
    }
  });

  it("maps contracted API errors to named states", async () => {
    for (const [status, code, expected] of [
      [401, "unauthorized", "unauthorized"],
      [403, "forbidden", "forbidden"],
      [404, "not_found", "not-found"],
    ] as const) {
      const fetchImpl = vi.fn(async () =>
        json({ error: { code, message: "denied", requestId: "req-1" } }, status),
      );
      const state = await listFindings("https://app.test", "proj-1", fetchImpl);
      expect(state.status).toBe(expected);
    }
  });

  it("treats a bare 404 page as unavailable, never as not-found", async () => {
    const fetchImpl = vi.fn(async () => new Response("Not found", { status: 404 }));
    const state = await listFindings("https://app.test", "proj-1", fetchImpl);
    expect(state.status).toBe("unavailable");
  });

  it("reports transport and 5xx failures as unavailable, never as data", async () => {
    const down = vi.fn(async () => {
      throw new Error("connection refused");
    });
    expect((await listFindings("https://app.test", "p", down)).status).toBe("unavailable");
    const broken = vi.fn(async () => json({}, 500));
    expect((await listFindings("https://app.test", "p", broken)).status).toBe("unavailable");
  });

  it("rejects malformed envelopes instead of rendering them", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ id: "nope" }] }));
    const state = await getFinding("https://app.test", "f1", fetchImpl);
    expect(state.status).toBe("unavailable");
  });

  it("fetches fix guidance with POST and parses the contract shape", async () => {
    const guidance = {
      findingId: FINDING.id,
      rootCause: "Missing ownership check.",
      smallestFix: "Scope the lookup.",
      requiredInvariants: ["Scope every read to the actor tenant."],
      testGuidance: "Replay the pack.",
    };
    const fetchImpl = vi.fn(async () => json({ data: guidance }));
    const state = await getFixPrompt("https://app.test", FINDING.id, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/findings/${FINDING.id}/fix-prompt`),
      expect.objectContaining({ method: "POST" }),
    );
    expect(state.status).toBe("ok");
  });

  it("requests a replay with the contracted body and idempotency key", async () => {
    const { ...replayRow } = REPLAY;
    const fetchImpl = vi.fn(async () => json({ data: replayRow }));
    const { ReplayRequestSchema: RequestSchema } = await import("@highcastle/contracts");
    const result = await requestReplay(
      "https://app.test",
      FINDING.id,
      RequestSchema.parse({
        originalAttemptId: "22222222-2222-4222-8222-222222222222",
        patchedEnvironmentId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        patchedRevision: "lab-v2-patched",
        authorizationScopeId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      }),
      "idem-key-1",
      fetchImpl,
    );
    const calls = fetchImpl.mock.calls;
    expect(calls).toHaveLength(1);
    const [, init] = calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-key-1");
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent).not.toHaveProperty("verdict");
    expect(result).toEqual({ status: "accepted", replayId: replayRow.id });
  });

  it("cannot smuggle a verdict into the replay request", async () => {
    const fetchImpl = vi.fn(async () => json({}));
    await expect(
      requestReplay(
        "https://app.test",
        FINDING.id,
        {
          originalAttemptId: "22222222-2222-4222-8222-222222222222",
          patchedEnvironmentId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
          patchedRevision: "lab-v2-patched",
          authorizationScopeId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
          verdict: "verified_fixed",
        } as unknown as Parameters<typeof requestReplay>[2],
        "idem-key-2",
        fetchImpl,
      ),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads a replay row for the comparison view", async () => {
    const { ...replayRow } = REPLAY;
    const fetchImpl = vi.fn(async () => json({ data: replayRow }));
    const state = await getReplay("https://app.test", REPLAY.id, fetchImpl);
    expect(state.status).toBe("ok");
    if (state.status === "ok") expect(state.data.verdict).toBe("verified_fixed");
  });
});
