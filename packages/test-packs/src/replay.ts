/**
 * Replay provenance record (L15).
 *
 * A replay links TWO independently executed, independently recorded
 * attempts — the original vulnerable-target run and the patched-target
 * run — without ever mutating the original. This record is the pack's
 * side of that linkage for the orchestrator (L16): it carries both
 * attempt IDs, both pinned revisions, both observed fixture versions,
 * and both oracle verdicts, so a reviewer can verify same-pack,
 * same-fixture-set, cross-revision comparison from one object.
 *
 * Fail-closed linkage guards (throw, never synthesize):
 * - the adjudication attached to `replay` must belong to the patched run
 *   (attempt-ID equality) — cross-wired evidence is rejected outright;
 * - the original and replay runs must be distinct attempts — a replay
 *   that re-reads the original evidence proves nothing.
 */

import type { AttemptId, OracleVerdict, ReplayVerdict } from "@highcastle/contracts";
import type { TrustedLabRevision } from "./fixtures.js";
import { BOLA_ORACLE_VERSION, BOLA_PACK_ID, BOLA_PACK_VERSION } from "./manifest.js";
import type { PackRunResult } from "./runner.js";
import type { BolaReplayAdjudication } from "./types.js";

export interface ReplayProvenanceRecord {
  packId: typeof BOLA_PACK_ID;
  packVersion: typeof BOLA_PACK_VERSION;
  oracleVersion: typeof BOLA_ORACLE_VERSION;
  originalAttemptId: AttemptId;
  replayAttemptId: AttemptId;
  originalExpectedRevision: TrustedLabRevision;
  originalObservedRevision: string | null;
  originalObservedFixtureVersion: string | null;
  originalVerdict: OracleVerdict;
  replayExpectedRevision: TrustedLabRevision;
  replayObservedRevision: string | null;
  replayObservedFixtureVersion: string | null;
  replayAttemptVerdict: OracleVerdict;
  replayVerdict: ReplayVerdict;
}

export function buildReplayRecord(
  original: PackRunResult,
  patched: PackRunResult,
  replay: BolaReplayAdjudication,
): ReplayProvenanceRecord {
  if (replay.attemptVerdict.attemptId !== patched.adjudication.attemptId) {
    throw new Error(
      "replay evidence cross-wired: adjudication does not belong to the patched run",
    );
  }
  if (original.attemptId === patched.attemptId) {
    throw new Error("original and replay runs must be independent attempts");
  }
  return {
    packId: BOLA_PACK_ID,
    packVersion: BOLA_PACK_VERSION,
    oracleVersion: BOLA_ORACLE_VERSION,
    originalAttemptId: original.attemptId,
    replayAttemptId: patched.attemptId,
    originalExpectedRevision: original.expectedRevision,
    originalObservedRevision: original.observedRevision,
    originalObservedFixtureVersion: original.observedFixtureVersion,
    originalVerdict: original.adjudication.verdict,
    replayExpectedRevision: patched.expectedRevision,
    replayObservedRevision: patched.observedRevision,
    replayObservedFixtureVersion: patched.observedFixtureVersion,
    replayAttemptVerdict: patched.adjudication.verdict,
    replayVerdict: replay.replayVerdict,
  };
}
