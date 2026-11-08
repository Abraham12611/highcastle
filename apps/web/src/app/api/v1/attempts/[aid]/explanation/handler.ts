import type { DbExecutor } from "@highcastle/db";
import { DbError } from "@highcastle/db";
import { parseUuid } from "@/server/http";
import type { Session } from "@/server/session";
import type { ExplanationDeps } from "./deps";

/**
 * Latest stored post-execution explanation for one attempt.
 *
 * Workspace-authorized through the caller's session: the attempt is
 * resolved inside the caller's workspace and project-authorized like
 * every other BFF read. Verdicts come from the persisted columns —
 * never from model JSON. Throws `DbError.notFound` when no explanation
 * was stored (model call failed safely or the worker has not run it
 * yet); the finding UI renders its unavailable state.
 */
export async function readAttemptExplanation(
  db: DbExecutor,
  session: Session,
  aid: string,
  deps: ExplanationDeps,
): Promise<{
  attemptId: string;
  oracleVerdict: "reproduced" | "not_reproduced" | "inconclusive";
  replayVerdict: "verified_fixed" | "still_vulnerable" | "regression" | "inconclusive" | null;
  summary: string | null;
  whatHappened: string | null;
  whyVerdict: string | null;
  replayMeaning: string | null;
  followUp: string | null;
  evidenceIds: string[];
  requestedModel: string;
  responseModel: string | null;
  requestId: string | null;
  latencyMs: number | null;
  rejectionCode: string | null;
}> {
  if (!parseUuid(aid)) throw new DbError("validation_error", "invalid attempt id");
  const workspaceId = await deps.authorizer.requestWorkspace(db, session, aid);
  const attempt = await deps.reader.getAttempt(db, workspaceId, aid);
  if (!attempt) throw DbError.notFound("test_attempt", aid);
  const scan = await deps.reader.getScan(db, workspaceId, attempt.scanId);
  if (!scan) throw DbError.notFound("test_attempt", aid);
  await deps.authorizer.authorizeProject(db, session, workspaceId, scan.projectId);
  const row = await deps.reader.getLatestExplanation(db, {
    workspaceId,
    scanId: attempt.scanId,
    attemptId: attempt.id,
  });
  if (!row) throw DbError.notFound("model_explanation", aid);
  const prose = (row.explanation ?? {}) as Record<string, unknown>;
  const summary = str(prose["summary"]);
  return {
    attemptId: row.attemptId,
    oracleVerdict: row.oracleVerdict,
    replayVerdict: row.replayVerdict ?? null,
    summary,
    whatHappened: str(prose["whatHappened"]),
    whyVerdict: str(prose["whyVerdict"]),
    replayMeaning: str(prose["replayMeaning"]),
    followUp: str(prose["followUp"]),
    evidenceIds: strArray(prose["evidenceIds"]),
    requestedModel: row.requestedModel,
    responseModel: row.responseModel ?? null,
    requestId: row.requestId ?? null,
    latencyMs: row.latencyMs ?? null,
    rejectionCode: summary === null ? (row.errorCode ?? "unavailable") : null,
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
