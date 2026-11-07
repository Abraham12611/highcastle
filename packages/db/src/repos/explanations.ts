import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import { modelExplanations } from "../schema/tables.js";
import { scans } from "../schema/scans.js";
import { DbError } from "../errors.js";

// --- Post-execution explanations (E8 writes via worker/E1; read-only for UI) ---

export interface RecordExplanationInput {
  workspaceId: string;
  scanId: string;
  attemptId: string;
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
