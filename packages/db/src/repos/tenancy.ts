import { eq } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import {
  evidenceArtifacts,
  findings,
  projects,
  replays,
  scans,
  testAttempts,
} from "../schema/tables.js";

/**
 * Resource → tenant resolution (issue #72 / E12).
 *
 * BFF routes that carry no workspace path segment (`/api/v1/scans/:id`,
 * `/api/v1/findings/:fid`, …) resolve the owning tenant from the resource
 * row itself, then the session must still prove membership before any data
 * is returned. A tenant ref is NOT authorization — it only locates the
 * tenant to check. Unknown ids resolve to `null`; callers answer 404 either
 * way so cross-tenant existence never leaks.
 */

export interface TenantRef {
  workspaceId: string;
  projectId?: string;
  scanId?: string;
  findingId?: string;
}

export async function findProjectTenant(
  db: DbExecutor,
  projectId: string,
): Promise<TenantRef | null> {
  const rows = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findScanTenant(db: DbExecutor, scanId: string): Promise<TenantRef | null> {
  const rows = await db
    .select({ workspaceId: scans.workspaceId, projectId: scans.projectId })
    .from(scans)
    .where(eq(scans.id, scanId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findFindingTenant(
  db: DbExecutor,
  findingId: string,
): Promise<TenantRef | null> {
  const rows = await db
    .select({ workspaceId: findings.workspaceId, projectId: findings.projectId })
    .from(findings)
    .where(eq(findings.id, findingId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findAttemptTenant(
  db: DbExecutor,
  attemptId: string,
): Promise<TenantRef | null> {
  const rows = await db
    .select({ workspaceId: testAttempts.workspaceId, scanId: testAttempts.scanId })
    .from(testAttempts)
    .where(eq(testAttempts.id, attemptId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findReplayTenant(
  db: DbExecutor,
  replayId: string,
): Promise<TenantRef | null> {
  const rows = await db
    .select({
      workspaceId: replays.workspaceId,
      projectId: replays.projectId,
      findingId: replays.findingId,
    })
    .from(replays)
    .where(eq(replays.id, replayId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findArtifactTenant(
  db: DbExecutor,
  artifactId: string,
): Promise<TenantRef | null> {
  const rows = await db
    .select({
      workspaceId: evidenceArtifacts.workspaceId,
      scanId: evidenceArtifacts.scanId,
    })
    .from(evidenceArtifacts)
    .where(eq(evidenceArtifacts.id, artifactId))
    .limit(1);
  return rows[0] ?? null;
}
