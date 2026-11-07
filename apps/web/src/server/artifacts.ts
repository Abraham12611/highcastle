import { and, eq } from "drizzle-orm";
import { DbError, evidenceArtifacts, getScan } from "@highcastle/db";
import type { BffDeps } from "./deps";
import { authorizeProject } from "./authz";
import type { RouteResult } from "./scans";

/**
 * Evidence artifacts. The database holds redacted METADATA (kind, digest,
 * size, content type); bytes live in S3-compatible object storage once L19
 * provisions it. This endpoint therefore returns the redacted metadata plus
 * an explicit download state — it never fabricates bytes and never serves
 * unredacted records.
 */

export async function getArtifactFlow(
  deps: BffDeps,
  input: { artifactId: string; workspaceId: string },
): Promise<RouteResult> {
  const rows = await deps.db
    .select()
    .from(evidenceArtifacts)
    .where(
      and(
        eq(evidenceArtifacts.id, input.artifactId),
        eq(evidenceArtifacts.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  const artifact = rows[0];
  if (!artifact) throw DbError.notFound("evidence_artifact", input.artifactId);
  if (artifact.redacted !== true) {
    // Fail closed: an unredacted record must never leave the server.
    throw DbError.notFound("evidence_artifact", input.artifactId);
  }
  const scan = await getScan(deps.db, input.workspaceId, artifact.scanId);
  if (!scan) throw DbError.notFound("evidence_artifact", input.artifactId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, scan.projectId);
  return {
    status: 200,
    body: {
      data: {
        id: artifact.id,
        scanId: artifact.scanId,
        attemptId: artifact.attemptId,
        artifactKind: artifact.artifactKind,
        storageKind: artifact.storageKind,
        sha256: artifact.sha256,
        byteSize: artifact.byteSize,
        contentType: artifact.contentType,
        redacted: artifact.redacted,
        createdAt:
          artifact.createdAt instanceof Date
            ? artifact.createdAt.toISOString()
            : artifact.createdAt,
        download:
          artifact.storageKind === "db"
            ? { available: false, reason: "object storage is not provisioned in the demo" }
            : { available: false, reason: "signed downloads require object storage (L19)" },
      },
    },
  };
}
