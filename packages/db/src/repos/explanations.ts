import { and, desc, eq } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import { modelExplanations } from "../schema/tables.js";
import { evidenceArtifacts, testAttempts } from "../schema/attempts.js";
import { scans } from "../schema/scans.js";
import { DbError } from "../errors.js";

// --- Post-execution explanations (E8 writes via worker/E1; read-only for UI) ---

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecordExplanationInput {
  workspaceId: string;
  scanId: string;
  attemptId: string;
  /**
   * Evidence artifact IDs the explanation cites. Every ID is verified
   * against `evidence_artifacts` for this exact workspace/scan/attempt —
   * caller-provided IDs are never trusted on their own.
   */
  evidenceIds: string[];
  requestedModel: string;
  responseModel?: string | null;
  requestId?: string | null;
  latencyMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  outcome: "success" | "malformed" | "policy_conflict" | "timeout" | "rate_limited" | "error";
  errorCode?: string | null;
  oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
  replayVerdict?: "verified_fixed" | "still_vulnerable" | "regression" | "inconclusive" | null;
  explanation?: unknown;
  rawExplanationRedacted: unknown;
}

export async function recordExplanation(db: DbExecutor, input: RecordExplanationInput) {
  const scan = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.id, input.scanId), eq(scans.workspaceId, input.workspaceId)))
    .limit(1);
  if (!scan[0]) throw DbError.notFound("scan", input.scanId);
  // The referenced attempt must be a real row in THIS scan/workspace —
  // never a caller-invented ID from another tenant's run.
  if (!UUID_RE.test(input.attemptId)) {
    throw new DbError("validation_error", "attemptId must be a UUID");
  }
  const attempts = await db
    .select({ id: testAttempts.id, verifierVerdict: testAttempts.verifierVerdict })
    .from(testAttempts)
    .where(
      and(
        eq(testAttempts.id, input.attemptId),
        eq(testAttempts.scanId, input.scanId),
        eq(testAttempts.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  const attempt = attempts[0];
  if (!attempt) throw DbError.notFound("test_attempt", input.attemptId);
  // The stored verdict must equal the attempt's persisted oracle verdict.
  // An explanation may never change the oracle result.
  if (attempt.verifierVerdict !== input.oracleVerdict) {
    throw DbError.conflict("explanation verdict must match the persisted oracle verdict", {
      attemptId: input.attemptId,
    });
  }
  // Every cited artifact must belong to THIS workspace/scan/attempt.
  for (const evidenceId of input.evidenceIds) {
    if (!UUID_RE.test(evidenceId)) {
      throw new DbError("validation_error", "evidenceId must be a UUID");
    }
    const artifacts = await db
      .select({ id: evidenceArtifacts.id })
      .from(evidenceArtifacts)
      .where(
        and(
          eq(evidenceArtifacts.id, evidenceId),
          eq(evidenceArtifacts.workspaceId, input.workspaceId),
          eq(evidenceArtifacts.scanId, input.scanId),
          eq(evidenceArtifacts.attemptId, input.attemptId),
        ),
      )
      .limit(1);
    if (!artifacts[0]) throw DbError.notFound("evidence_artifact", evidenceId);
  }
  const [row] = await db
    .insert(modelExplanations)
    .values({
      workspaceId: input.workspaceId,
      scanId: input.scanId,
      attemptId: input.attemptId,
      provider: "vultr",
      requestedModel: input.requestedModel,
      responseModel: input.responseModel ?? null,
      requestId: input.requestId ?? null,
      latencyMs: input.latencyMs ?? null,
      tokensInput: input.tokensInput ?? null,
      tokensOutput: input.tokensOutput ?? null,
      outcome: input.outcome,
      errorCode: input.errorCode ?? null,
      oracleVerdict: input.oracleVerdict,
      replayVerdict: input.replayVerdict ?? null,
      explanation: input.explanation ?? null,
      // The column is NOT NULL by design: even safe-failure rows keep a
      // redacted marker so "no explanation recorded" is distinguishable
      // from "missing row". Never raw provider text.
      rawExplanationRedacted:
        input.rawExplanationRedacted ??
        ({ unavailable: input.errorCode ?? input.outcome } as unknown as Record<string, unknown>),
    })
    .returning();
  if (!row) throw new DbError("internal", "model_explanation insert returned no row");
  return row;
}

/** Latest stored explanation for one attempt (BFF read serves this). */
export async function getLatestExplanationForAttempt(
  db: DbExecutor,
  input: { workspaceId: string; scanId: string; attemptId: string },
) {
  const rows = await db
    .select()
    .from(modelExplanations)
    .where(
      and(
        eq(modelExplanations.workspaceId, input.workspaceId),
        eq(modelExplanations.scanId, input.scanId),
        eq(modelExplanations.attemptId, input.attemptId),
      ),
    )
    .orderBy(desc(modelExplanations.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listExplanationsForAttempt(
  db: DbExecutor,
  input: { workspaceId: string; scanId: string; attemptId: string },
) {
  return db
    .select()
    .from(modelExplanations)
    .where(
      and(
        eq(modelExplanations.workspaceId, input.workspaceId),
        eq(modelExplanations.scanId, input.scanId),
        eq(modelExplanations.attemptId, input.attemptId),
      ),
    );
}
