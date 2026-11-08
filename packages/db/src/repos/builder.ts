import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import {
  passiveReconObservations,
  passiveReconRuns,
  sitePermissions,
  siteVerifications,
  type PassiveReconObservationRow,
  type PassiveReconRunRow,
  type SitePermission,
  type SiteVerification,
} from "../schema/builder.js";
import { targets } from "../schema/projects.js";
import { DbError } from "../errors.js";

/**
 * Builder (URL-only) onboarding persistence — tenant-scoped, append-mostly.
 * Permissions are never deleted (revoke sets revokedAt); recon artifacts are
 * metadata-only.
 */

// --- Site verifications -------------------------------------------------------

export async function issueSiteVerification(
  db: DbExecutor,
  input: {
    workspaceId: string;
    projectId: string;
    targetId: string;
    token: string;
    dnsRecordName: string;
    dnsTxtValue: string;
    wellKnownUrl: string;
    wellKnownExpectedBody: string;
    issuedBy: string;
    expiresAt: Date;
  },
): Promise<SiteVerification> {
  // One pending challenge per target — expire previous pending rows.
  await db
    .update(siteVerifications)
    .set({ status: "expired" })
    .where(
      and(eq(siteVerifications.targetId, input.targetId), eq(siteVerifications.status, "pending")),
    );
  const [row] = await db.insert(siteVerifications).values(input).returning();
  if (!row) throw new DbError("internal", "site verification insert returned no row");
  return row;
}

export async function getActiveSiteVerification(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
): Promise<SiteVerification | null> {
  const rows = await db
    .select()
    .from(siteVerifications)
    .where(
      and(
        eq(siteVerifications.targetId, targetId),
        eq(siteVerifications.workspaceId, workspaceId),
        eq(siteVerifications.status, "pending"),
      ),
    )
    .orderBy(desc(siteVerifications.issuedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordVerificationAttempt(
  db: DbExecutor,
  id: string,
  outcome:
    | { status: "verified"; method: "dns-txt" | "well-known"; verifiedAt: Date }
    | { status: "failed" | "unreachable"; lastError: string },
): Promise<SiteVerification> {
  const [row] = await db
    .update(siteVerifications)
    .set(
      outcome.status === "verified"
        ? {
            status: "verified",
            method: outcome.method,
            verifiedAt: outcome.verifiedAt,
            lastError: null,
            attempts: sql`${siteVerifications.attempts} + 1` as unknown as number,
          }
        : {
            status: outcome.status,
            lastError: outcome.lastError,
            attempts: sql`${siteVerifications.attempts} + 1` as unknown as number,
          },
    )
    .where(eq(siteVerifications.id, id))
    .returning();
  if (!row) throw DbError.notFound("site_verification", id);
  return row;
}

export async function getLatestSiteVerification(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
): Promise<SiteVerification | null> {
  const rows = await db
    .select()
    .from(siteVerifications)
    .where(
      and(eq(siteVerifications.targetId, targetId), eq(siteVerifications.workspaceId, workspaceId)),
    )
    .orderBy(desc(siteVerifications.issuedAt))
    .limit(1);
  return rows[0] ?? null;
}

// --- Site permissions ---------------------------------------------------------

export async function grantSitePermission(
  db: DbExecutor,
  input: {
    workspaceId: string;
    targetId: string;
    actorUserId: string;
    allowedPaths: string[];
    consentVersion: string;
    consentText: string;
    expiresAt?: Date | null;
  },
): Promise<SitePermission> {
  const [row] = await db.insert(sitePermissions).values(input).returning();
  if (!row) throw new DbError("internal", "site permission insert returned no row");
  return row;
}

/** Active (unrevoked, unexpired) permission for a target, latest first. */
export async function getActiveSitePermission(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
  now: Date,
): Promise<SitePermission | null> {
  const rows = await db
    .select()
    .from(sitePermissions)
    .where(
      and(
        eq(sitePermissions.targetId, targetId),
        eq(sitePermissions.workspaceId, workspaceId),
        isNull(sitePermissions.revokedAt),
      ),
    )
    .orderBy(desc(sitePermissions.grantedAt))
    .limit(1);
  const p = rows[0];
  if (!p) return null;
  if (p.expiresAt !== null && p.expiresAt <= now) return null;
  return p;
}

/** Latest permission row regardless of state — distinguishes "never
 * granted" from "revoked". */
export async function getLatestSitePermission(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
): Promise<SitePermission | null> {
  const rows = await db
    .select()
    .from(sitePermissions)
    .where(
      and(eq(sitePermissions.targetId, targetId), eq(sitePermissions.workspaceId, workspaceId)),
    )
    .orderBy(desc(sitePermissions.grantedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeSitePermission(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
  revokedBy: string,
  now: Date,
): Promise<number> {
  const rows = await db
    .update(sitePermissions)
    .set({ revokedAt: now, revokedBy })
    .where(
      and(
        eq(sitePermissions.targetId, targetId),
        eq(sitePermissions.workspaceId, workspaceId),
        isNull(sitePermissions.revokedAt),
      ),
    )
    .returning();
  return rows.length;
}

// --- Passive recon runs -------------------------------------------------------

export async function createReconRun(
  db: DbExecutor,
  input: {
    workspaceId: string;
    targetId: string;
    permissionId: string | null;
    runBy: string;
  },
): Promise<PassiveReconRunRow> {
  const [row] = await db.insert(passiveReconRuns).values(input).returning();
  if (!row) throw new DbError("internal", "recon run insert returned no row");
  return row;
}

export async function finishReconRun(
  db: DbExecutor,
  runId: string,
  patch: {
    status: "completed" | "partial" | "failed" | "quota_limited" | "unreachable";
    requestCount: number;
    bytesReceived: number;
    limitations: unknown;
    errorCode?: string | null;
    errorDetail?: string | null;
    completedAt: Date;
  },
): Promise<void> {
  await db.update(passiveReconRuns).set(patch).where(eq(passiveReconRuns.id, runId));
}

export async function addReconObservations(
  db: DbExecutor,
  runId: string,
  observations: Array<{
    kind: string;
    name: string;
    observed: boolean;
    detail: string | null;
    severity: string;
  }>,
): Promise<void> {
  if (observations.length === 0) return;
  await db.insert(passiveReconObservations).values(observations.map((o) => ({ ...o, runId })));
}

export async function getReconRun(
  db: DbExecutor,
  workspaceId: string,
  runId: string,
): Promise<PassiveReconRunRow | null> {
  const rows = await db
    .select()
    .from(passiveReconRuns)
    .where(and(eq(passiveReconRuns.id, runId), eq(passiveReconRuns.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestReconRun(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
): Promise<PassiveReconRunRow | null> {
  const rows = await db
    .select()
    .from(passiveReconRuns)
    .where(
      and(eq(passiveReconRuns.targetId, targetId), eq(passiveReconRuns.workspaceId, workspaceId)),
    )
    .orderBy(desc(passiveReconRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listReconObservations(
  db: DbExecutor,
  runId: string,
): Promise<PassiveReconObservationRow[]> {
  return db
    .select()
    .from(passiveReconObservations)
    .where(eq(passiveReconObservations.runId, runId))
    .orderBy(passiveReconObservations.createdAt);
}

/** Runs in the last N seconds — for per-target quota enforcement. */
export async function countRecentReconRuns(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ id: passiveReconRuns.id })
    .from(passiveReconRuns)
    .where(
      and(
        eq(passiveReconRuns.targetId, targetId),
        eq(passiveReconRuns.workspaceId, workspaceId),
        gte(passiveReconRuns.startedAt, since),
      ),
    );
  return rows.length;
}

/** Mark the target's verification/state fields after a verify attempt. */
export async function updateTargetVerificationState(
  db: DbExecutor,
  workspaceId: string,
  targetId: string,
  patch: {
    state?:
      | "draft"
      | "pending_verification"
      | "verified"
      | "verification_failed"
      | "expired"
      | "disabled";
    verificationStatus?: string | null;
    verificationMethod?:
      "synthetic_lab_attestation" | "dns_challenge" | "http_challenge" | "manual_review" | null;
    verifiedBy?: string | null;
    verifiedAt?: Date | null;
    verificationExpiresAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(targets)
    .set(patch)
    .where(and(eq(targets.id, targetId), eq(targets.workspaceId, workspaceId)));
}
