import { afterEach, describe, expect, it } from "vitest";
import { adjudicateReplay } from "./oracle.js";
import { buildReplayRecord } from "./replay.js";
import { runBolaPack, type PackRunResult } from "./runner.js";
import { STUB_ALICE_TOKEN, startStubLab, type StubLab } from "./test/stubLab.js";

const labs: StubLab[] = [];
afterEach(async () => {
  while (labs.length > 0) {
    await labs.pop()?.close();
  }
});

async function runAgainst(
  revision: "lab-v1-vulnerable" | "lab-v2-patched",
  behavior: "vulnerable" | "patched",
): Promise<PackRunResult> {
  const lab = await startStubLab({ revision, behavior });
  labs.push(lab);
  return runBolaPack({
    baseUrl: lab.baseUrl,
    aliceCredential: STUB_ALICE_TOKEN,
    expectedRevision: revision,
  });
}

describe("buildReplayRecord", () => {
  it("records original and replay evidence independently with provenance", async () => {
    const original = await runAgainst("lab-v1-vulnerable", "vulnerable");
    const patched = await runAgainst("lab-v2-patched", "patched");
    const replay = adjudicateReplay(patched.adjudication);
    expect(replay.replayVerdict).toBe("verified_fixed");

    const record = buildReplayRecord(original, patched, replay);
    expect(record.packId).toBe("bola-invoice-v1");
    expect(record.packVersion).toBe("1.0.0");
    expect(record.oracleVersion).toBe("bola-oracle-v1");
    // Both attempts preserved, distinct, with explicit revision + fixture provenance.
    expect(record.originalAttemptId).not.toBe(record.replayAttemptId);
    expect(record.originalExpectedRevision).toBe("lab-v1-vulnerable");
    expect(record.originalObservedRevision).toBe("lab-v1-vulnerable");
    expect(record.originalObservedFixtureVersion).toBe("1.0.0");
    expect(record.originalVerdict).toBe("reproduced");
    expect(record.replayExpectedRevision).toBe("lab-v2-patched");
    expect(record.replayObservedRevision).toBe("lab-v2-patched");
    expect(record.replayObservedFixtureVersion).toBe("1.0.0");
    expect(record.replayAttemptVerdict).toBe("not_reproduced");
    expect(record.replayVerdict).toBe("verified_fixed");
    // The original attempt is immutable: building the record changed nothing.
    expect(original.adjudication.verdict).toBe("reproduced");
  });

  it("rejects cross-wired adjudications", async () => {
    const original = await runAgainst("lab-v1-vulnerable", "vulnerable");
    const patched = await runAgainst("lab-v2-patched", "patched");
    const crossed = adjudicateReplay(original.adjudication);
    expect(() => buildReplayRecord(original, patched, crossed)).toThrow(
      /cross-wired/,
    );
  });

  it("rejects a replay that reuses the original attempt", async () => {
    const original = await runAgainst("lab-v1-vulnerable", "vulnerable");
    const replay = adjudicateReplay(original.adjudication);
    expect(() => buildReplayRecord(original, original, replay)).toThrow(
      /independent attempts/,
    );
  });

  it("carries inconclusive replays without upgrading them", async () => {
    const original = await runAgainst("lab-v1-vulnerable", "vulnerable");
    // Patched target, but the run was pinned to the wrong revision: the
    // legs look like a clean denial, yet the replay must stay inconclusive.
    const lab = await startStubLab({ revision: "lab-v2-patched", behavior: "patched" });
    labs.push(lab);
    const patched = await runBolaPack({
      baseUrl: lab.baseUrl,
      aliceCredential: STUB_ALICE_TOKEN,
      expectedRevision: "lab-v1-vulnerable",
    });
    expect(patched.adjudication.baseline).toBe("pass");
    expect(patched.adjudication.securityCheck).toBe("pass");
    expect(patched.adjudication.preconditionsOk).toBe(false);
    const record = buildReplayRecord(original, patched, adjudicateReplay(patched.adjudication));
    expect(record.replayVerdict).toBe("inconclusive");
    expect(record.originalVerdict).toBe("reproduced");
  });
});
