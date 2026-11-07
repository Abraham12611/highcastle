import {
  DbError,
  getAttempt,
  getLatestExplanationForAttempt,
  getScan,
} from "@highcastle/db";
import { requestWorkspace, authorizeProject } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";

export const dynamic = "force-dynamic";

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * GET /api/v1/attempts/:aid/explanation — latest stored post-execution
 * explanation for one attempt (Engineer 8, issue #55).
 *
 * Workspace-authorized: the attempt is resolved inside the caller's
 * workspace and project-authorized like every other BFF read. Verdicts
 * come from the persisted columns — never from model JSON. Returns 404
 * when no explanation was stored (model call failed safely or the worker
 * has not run it yet); the finding UI renders its unavailable state.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ aid: string }> },
) {
  const { aid } = await context.params;
  return handle(request, "GET /api/v1/attempts/:aid/explanation", { aid }, async ({ deps }) => {
    if (!parseUuid(aid)) throw new DbError("validation_error", "invalid attempt id");
    const workspaceId = await requestWorkspace(deps.db, deps.session);
    const attempt = await getAttempt(deps.db, workspaceId, aid);
    if (!attempt) throw DbError.notFound("test_attempt", aid);
    const scan = await getScan(deps.db, workspaceId, attempt.scanId);
    if (!scan) throw DbError.notFound("test_attempt", aid);
    await authorizeProject(deps.db, deps.session, workspaceId, scan.projectId);
    const row = await getLatestExplanationForAttempt(deps.db, {
      workspaceId,
      scanId: attempt.scanId,
      attemptId: attempt.id,
    });
    if (!row) throw DbError.notFound("model_explanation", aid);
    const prose = (row.explanation ?? {}) as Record<string, unknown>;
    const summary = str(prose["summary"]);
    return {
      status: 200,
      body: {
        data: {
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
        },
      },
    };
  });
}
