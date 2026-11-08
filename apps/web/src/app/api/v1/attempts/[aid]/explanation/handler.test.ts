import { describe, expect, it, vi } from "vitest";
import { DbError } from "@highcastle/db";
import type { Session } from "@/server/session";
import type { ExplanationDeps } from "./deps";
import { readAttemptExplanation } from "./handler";

const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION = { kind: "demo", workspaceId: "ws-1" } as unknown as Session;

function depsWith(overrides: Partial<{
  attempt: { id: string; scanId: string } | null;
  scan: { projectId: string } | null;
  row: {
    attemptId: string;
    oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
    replayVerdict: null;
    explanation: unknown;
    requestedModel: string;
    responseModel: string | null;
    requestId: string | null;
    latencyMs: number | null;
    errorCode: string | null;
  } | null;
  authorize: "ok" | "deny";
}>): ExplanationDeps {
  return {
    reader: {
      getAttempt: vi.fn(async () => overrides.attempt ?? null),
      getScan: vi.fn(async () => overrides.scan ?? null),
      getLatestExplanation: vi.fn(async () => overrides.row ?? null),
    },
    authorizer: {
      requestWorkspace: vi.fn(async () => "ws-1"),
      authorizeProject:
        overrides.authorize === "deny"
          ? vi.fn(async () => {
              throw DbError.notFound("project", "p-1");
            })
          : vi.fn(async () => {}),
    },
  };
}

const ROW = {
  attemptId: ATTEMPT_ID,
  oracleVerdict: "reproduced" as const,
  replayVerdict: null,
  explanation: {
    explanationVersion: 1,
    summary: "Alice read Bob's invoice.",
    whatHappened: "Id-only lookup.",
    whyVerdict: "HTTP 200 with Bob's data.",
    replayMeaning: null,
    verdictEcho: "reproduced",
    attemptIdEcho: ATTEMPT_ID,
    evidenceIds: ["ev-1"],
    followUp: null,
  },
  requestedModel: "live-model-x",
  responseModel: "live-model-x",
  requestId: "req-1",
  latencyMs: 10,
  errorCode: null,
};

describe("readAttemptExplanation", () => {
  it("maps the persisted row with verdicts from columns, not model JSON", async () => {
    const data = await readAttemptExplanation(
      {} as never,
      SESSION,
      ATTEMPT_ID,
      depsWith({
        attempt: { id: ATTEMPT_ID, scanId: "scan-1" },
        scan: { projectId: "p-1" },
        row: ROW,
      }),
    );
    expect(data.attemptId).toBe(ATTEMPT_ID);
    expect(data.oracleVerdict).toBe("reproduced");
    expect(data.summary).toContain("Alice");
    expect(data.evidenceIds).toEqual(["ev-1"]);
    expect(data.rejectionCode).toBeNull();
  });

  it("marks the safe-failure row with the stored error code", async () => {
    const data = await readAttemptExplanation(
      {} as never,
      SESSION,
      ATTEMPT_ID,
      depsWith({
        attempt: { id: ATTEMPT_ID, scanId: "scan-1" },
        scan: { projectId: "p-1" },
        row: { ...ROW, explanation: null, errorCode: "timeout" },
      }),
    );
    expect(data.summary).toBeNull();
    expect(data.oracleVerdict).toBe("reproduced");
    expect(data.rejectionCode).toBe("timeout");
  });

  it("throws not_found when no explanation was stored", async () => {
    await expect(
      readAttemptExplanation(
        {} as never,
        SESSION,
        ATTEMPT_ID,
        depsWith({
          attempt: { id: ATTEMPT_ID, scanId: "scan-1" },
          scan: { projectId: "p-1" },
          row: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws not_found for cross-workspace attempts and denied projects", async () => {
    await expect(
      readAttemptExplanation(
        {} as never,
        SESSION,
        ATTEMPT_ID,
        depsWith({ attempt: null, scan: null, row: ROW }),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      readAttemptExplanation(
        {} as never,
        SESSION,
        ATTEMPT_ID,
        depsWith({
          attempt: { id: ATTEMPT_ID, scanId: "scan-1" },
          scan: { projectId: "p-1" },
          row: ROW,
          authorize: "deny",
        }),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects malformed attempt IDs before any store access", async () => {
    const deps = depsWith({
      attempt: { id: ATTEMPT_ID, scanId: "scan-1" },
      scan: { projectId: "p-1" },
      row: ROW,
    });
    await expect(readAttemptExplanation({} as never, SESSION, "nope", deps)).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(deps.reader.getAttempt).not.toHaveBeenCalled();
  });
});
