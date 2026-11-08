import { describe, expect, it } from "vitest";
import {
  DEMO_FINDING_ID,
  DEMO_REPLAY_ID,
  demoFindingDetail,
  demoFindingSummary,
  demoPatchedAttempt,
  demoReplayRecord,
} from "./demo";
import type { AttemptRecord } from "./types";

function mustAttempt(): AttemptRecord {
  const attempt = demoFindingDetail().attempt;
  if (attempt === null) throw new Error("demo attempt missing");
  return attempt;
}

describe("synthetic demo source (real oracle, recorded observations)", () => {
  it("derives reproduced on the vulnerable record via the oracle", () => {
    expect(mustAttempt().verdict).toBe("reproduced");
    expect(mustAttempt().baseline.identity?.ownerId).toBe("user_A");
    expect(mustAttempt().crossAccount.identity?.ownerId).toBe("user_B");
  });

  it("derives verified_fixed on the patched replay via the oracle", () => {
    const replay = demoReplayRecord();
    expect(replay.replayId).toBe(DEMO_REPLAY_ID);
    expect(replay.verdict).toBe("verified_fixed");
    expect(replay.originalVerdict).toBe("reproduced");
    expect(replay.originalRevision).toBe("lab-v1-vulnerable");
    expect(replay.patchedRevision).toBe("lab-v2-patched");
  });

  it("keeps original and replay attempts independent with provenance", () => {
    const detail = demoFindingDetail();
    const patched = demoPatchedAttempt();
    const attempt = mustAttempt();
    expect(attempt.attemptId).not.toBe(patched.attemptId);
    expect(patched.verdict).toBe("not_reproduced");
    expect(detail.replay?.replayAttemptId).toBe(patched.attemptId);
    expect(detail.replay?.originalAttemptId).toBe(attempt.attemptId);
  });

  it("is always labeled as synthetic demo data", () => {
    expect(demoFindingSummary().id).toBe(DEMO_FINDING_ID);
    const source = demoFindingDetail().source;
    expect(source.kind).toBe("demo");
    if (source.kind === "demo") {
      expect(source.note).toContain("Synthetic demo data");
    }
  });

  it("records real digests and no secrets", () => {
    const detail = demoFindingDetail();
    const attempt = mustAttempt();
    const serialized = JSON.stringify(detail);
    for (const leg of [attempt.baseline, attempt.crossAccount]) {
      expect(leg.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(serialized).not.toContain("lab-token-");
    expect(serialized).not.toContain("lab-session-");
    expect(serialized).not.toContain("Bearer ");
  });
});
