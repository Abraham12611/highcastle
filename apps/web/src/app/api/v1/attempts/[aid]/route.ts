import { DbError, getAttempt, listEvidenceForAttempt, findAttemptTenant } from "@highcastle/db";
import { authorizeResourceTenant, authorizeProject } from "@/server/authz";
import { parseUuid } from "@/server/http";
import { handle } from "@/server/route";
import { getScan } from "@highcastle/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ aid: string }> }) {
  const { aid } = await context.params;
  return handle(request, "GET /api/v1/attempts/:aid", { aid }, async ({ deps }) => {
    if (!parseUuid(aid)) throw new DbError("validation_error", "invalid attempt id");
    const { workspaceId } = await authorizeResourceTenant(deps.db, deps.session, () =>
      findAttemptTenant(deps.db, aid),
    );
    const attempt = await getAttempt(deps.db, workspaceId, aid);
    if (!attempt) throw DbError.notFound("test_attempt", aid);
    const scan = await getScan(deps.db, workspaceId, attempt.scanId);
    if (!scan) throw DbError.notFound("test_attempt", aid);
    await authorizeProject(deps.db, deps.session, workspaceId, scan.projectId);
    const evidence = await listEvidenceForAttempt(deps.db, workspaceId, aid);
    const iso = (value: Date | string | null): string | null =>
      value === null ? null : value instanceof Date ? value.toISOString() : value;
    return {
      status: 200,
      body: {
        data: {
          id: attempt.id,
          scanId: attempt.scanId,
          packId: attempt.packId,
          packVersion: attempt.packVersion,
          status: attempt.status,
          verdict: attempt.verifierVerdict ?? null,
          positiveControlPassed: attempt.positiveControlPassed ?? null,
          negativeSecurityConditionMet: attempt.negativeSecurityConditionMet ?? null,
          startedAt: iso(attempt.startedAt),
          endedAt: iso(attempt.endedAt),
          evidence: evidence.map((item) => ({
            id: item.id,
            artifactKind: item.artifactKind,
            sha256: item.sha256,
            byteSize: item.byteSize,
            contentType: item.contentType,
          })),
        },
      },
    };
  });
}
