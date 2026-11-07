import { randomBytes } from "node:crypto";
import {
  analyzePassivePages,
  canonicalizeHttpsUrl,
  isBlockedResolvedAddress,
  newVerificationChallenge,
  normalizeHostname,
  normalizeScopedPath,
  runPassiveRecon,
  standardLimitations,
  verifyDnsTxt,
  verifyWellKnown,
  ReconError,
  type DnsResolver,
  type SocketFactory,
} from "@highcastle/security";
import {
  DbError,
  countRecentReconRuns,
  createProject,
  createReconRun,
  createTarget,
  finishReconRun,
  getActiveSitePermission,
  getActiveSiteVerification,
  getLatestReconRun,
  getLatestSitePermission,
  getLatestSiteVerification,
  getReconRun,
  getTarget,
  grantSitePermission,
  issueSiteVerification,
  listReconObservations,
  recordVerificationAttempt,
  revokeSitePermission,
  updateTargetVerificationState,
  addReconObservations,
} from "@highcastle/db";
import {
  CONSENT_VERSION_V1,
  type BuilderTargetStatus,
  type PassiveObservation,
  type PassiveReconStatus,
} from "@highcastle/contracts";
import { authorizeWorkspace } from "./authz";
import type { BffDeps } from "./deps";
import { requestTime } from "./deps";
import { nodeDnsResolver, tlsSocketFactory } from "./recon-node";
import type { RouteResult } from "./scans";

/**
 * Builder (URL-only) onboarding flows: draft project → ownership challenge →
 * explicit permitted-path consent → strictly passive recon.
 *
 * Hard boundaries enforced here (in addition to the egress layers in
 * @highcastle/security):
 *  - account sessions only — demo sessions are pinned to the synthetic lab
 *    and may never point ANY outbound request at a user-supplied host;
 *  - every fetch goes through the pinned TLS fetcher (validated IP, no DNS
 *    re-resolution after pinning, no cross-host redirects, hard byte/time/
 *    request quotas) — never the sandbox runner, never raw `fetch`;
 *  - recon requires verified target + active permission + run quota;
 *  - stored artifacts contain headers/status/TLS facts only — never bodies,
 *    cookies, tokens, or response secrets.
 */

const RECON_RUNS_PER_DAY = 5;
const CONSENT_TEXT =
  "I control this site (or am authorized to approve testing). " +
  "I permit HighCastle to fetch ONLY the listed public paths over HTTPS " +
  "with strict request/size/time limits: no authentication attempts, no " +
  "form submissions, no intrusive or destructive testing. Verification " +
  "proves site control only — it does not provide source access or " +
  "authorize intrusive testing of shared hosting platforms.";

export interface ReconDeps {
  resolver: DnsResolver;
  fetcher: SocketFactory;
}

function reconDeps(deps: BffDeps): ReconDeps {
  return deps.recon ?? { resolver: nodeDnsResolver, fetcher: tlsSocketFactory };
}

/** Builder onboarding mutates real outbound policy — never available to the
 *  demo session (which is lab-pinned per authz rules). */
function requireAccount(deps: BffDeps): void {
  if (deps.session.kind !== "account") {
    throw new DbError(
      "forbidden",
      "site onboarding requires a signed-in account — the demo session is fixed to the synthetic lab",
    );
  }
}

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "site";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Accept http(s) input and canonicalize to the https form (scheme upgrade,
 * not a redirect fetch). */
function canonicalizeInput(raw: string) {
  const trimmed = raw.trim();
  const https = /^http:\/\//i.test(trimmed) ? `https://${trimmed.slice(7)}` : trimmed;
  const canon = canonicalizeHttpsUrl(https);
  if (!canon.ok) {
    const first = canon.reasons[0];
    throw new DbError(
      "validation_error",
      `site URL not permitted: ${first?.detail ?? first?.code ?? "unsafe_url"}`,
    );
  }
  return canon.canonical;
}

// --- Flows ------------------------------------------------------------------

export async function createBuilderProjectFlow(
  deps: BffDeps,
  workspaceId: string,
  input: { name: string; siteUrl: string; description?: string | undefined },
): Promise<RouteResult> {
  requireAccount(deps);
  const workspace = await authorizeWorkspace(deps.db, deps.session, workspaceId);
  const canonical = canonicalizeInput(input.siteUrl);
  const now = requestTime(deps);

  const project = await createProject(deps.db, {
    workspaceId: workspace.id,
    slug: slugify(input.name),
    name: input.name,
    description: input.description ?? null,
    kind: "url",
    createdBy: deps.session.userId,
  });
  const target = await createTarget(deps.db, {
    workspaceId: workspace.id,
    projectId: project.id,
    label: normalizeHostname(canonical.url.hostname),
    canonicalOrigin: canonical.normalizedOrigin,
    targetKind: "approved_other",
  });
  await updateTargetVerificationState(deps.db, workspace.id, target.id, {
    state: "pending_verification",
    verificationStatus: "pending",
  });

  const challenge = newVerificationChallenge(canonical.normalizedOrigin, now);
  const v = await issueSiteVerification(deps.db, {
    workspaceId: workspace.id,
    projectId: project.id,
    targetId: target.id,
    token: challenge.token,
    dnsRecordName: challenge.dnsRecordName,
    dnsTxtValue: challenge.dnsTxtValue,
    wellKnownUrl: challenge.wellKnownUrl,
    wellKnownExpectedBody: challenge.wellKnownExpectedBody,
    issuedBy: deps.session.userId,
    expiresAt: challenge.expiresAt,
  });

  return {
    status: 201,
    body: {
      data: {
        projectId: project.id,
        targetId: target.id,
        state: "pending_verification",
        verification: mapVerification(v),
        note: "Draft created — site control must be proven before any checks run. Verification proves control only; it never grants source access.",
      },
    },
  };
}

export async function getBuilderTargetFlow(
  deps: BffDeps,
  workspaceId: string,
  targetId: string,
): Promise<RouteResult> {
  requireAccount(deps);
  const workspace = await authorizeWorkspace(deps.db, deps.session, workspaceId);
  const target = await getTarget(deps.db, workspace.id, targetId);
  if (!target) throw DbError.notFound("target", targetId);

  const now = requestTime(deps);
  const verification = await getLatestSiteVerification(deps.db, workspace.id, target.id);
  const permission = await getActiveSitePermission(deps.db, workspace.id, target.id, now);
  const anyPermission = await latestPermissionAny(deps, workspace.id, target.id);
  const lastRun = await getLatestReconRun(deps.db, workspace.id, target.id);
  const observations = lastRun ? await listReconObservations(deps.db, lastRun.id) : [];

  return {
    status: 200,
    body: {
      data: {
        targetId: target.id,
        state: target.state,
        builderStatus: deriveBuilderStatus(
          target.state,
          verification,
          permission,
          anyPermission,
          lastRun,
        ),
        canonicalOrigin: target.canonicalOrigin,
        verification: verification ? mapVerification(verification) : null,
        permission: permission ? mapPermission(permission) : null,
        lastRecon: lastRun ? mapRun(lastRun, observations) : null,
      },
    },
  };
}

export async function verifyBuilderTargetFlow(
  deps: BffDeps,
  workspaceId: string,
  targetId: string,
  method: "dns-txt" | "well-known",
): Promise<RouteResult> {
  requireAccount(deps);
  const workspace = await authorizeWorkspace(deps.db, deps.session, workspaceId);
  const target = await getTarget(deps.db, workspace.id, targetId);
  if (!target) throw DbError.notFound("target", targetId);
  if (target.state === "verified") {
    throw new DbError("conflict", "target is already verified");
  }

  const now = requestTime(deps);
  const v = await getActiveSiteVerification(deps.db, workspace.id, target.id);
  if (!v) throw new DbError("conflict", "no pending verification — re-issue the challenge");
  if (v.expiresAt <= now) {
    await updateTargetVerificationState(deps.db, workspace.id, target.id, {
      verificationStatus: "expired",
    });
    throw new DbError("conflict", "verification challenge expired — request a new one");
  }

  const { resolver, fetcher } = reconDeps(deps);
  const challenge = {
    token: v.token,
    expiresAt: v.expiresAt,
    dnsRecordName: v.dnsRecordName,
    dnsTxtValue: v.dnsTxtValue,
    wellKnownUrl: v.wellKnownUrl,
    wellKnownExpectedBody: v.wellKnownExpectedBody,
  };

  const outcome =
    method === "dns-txt"
      ? await verifyDnsTxt(challenge, resolver)
      : await verifyWellKnown(challenge, resolver, fetcher);

  if (outcome.ok) {
    await recordVerificationAttempt(deps.db, v.id, {
      status: "verified",
      method,
      verifiedAt: now,
    });
    await updateTargetVerificationState(deps.db, workspace.id, target.id, {
      state: "verified",
      verificationStatus: "verified",
      verificationMethod: method === "dns-txt" ? "dns_challenge" : "http_challenge",
      verifiedBy: deps.session.userId,
      verifiedAt: now,
      verificationExpiresAt: new Date(now.getTime() + 90 * 86400_000),
    });
    return {
      status: 200,
      body: {
        data: {
          targetId: target.id,
          status: "verified",
          state: "verified",
          verifiedAt: now.toISOString(),
          reason: null,
        },
      },
    };
  }

  const status =
    outcome.code === "unreachable" || outcome.code === "dns_failed" ? "unreachable" : "failed";
  await recordVerificationAttempt(deps.db, v.id, {
    status,
    lastError: outcome.reason.slice(0, 500),
  });
  await updateTargetVerificationState(deps.db, workspace.id, target.id, {
    state: "verification_failed",
    verificationStatus: status,
  });
  return {
    status: 200,
    body: {
      data: {
        targetId: target.id,
        status,
        state: "verification_failed",
        verifiedAt: null,
        reason: outcome.reason,
      },
    },
  };
}

export async function grantSitePermissionFlow(
  deps: BffDeps,
  workspaceId: string,
  targetId: string,
  input: { allowedPaths: string[] },
): Promise<RouteResult> {
  requireAccount(deps);
  const workspace = await authorizeWorkspace(deps.db, deps.session, workspaceId);
  const target = await getTarget(deps.db, workspace.id, targetId);
  if (!target) throw DbError.notFound("target", targetId);
  if (target.state !== "verified") {
    throw new DbError(
      "policy_denied",
      "permission requires a verified target — complete ownership verification first",
    );
  }

  // Normalize + dedupe each path through the scope path rules — anything
  // that cannot normalize fails closed.
  const paths = [...new Set(input.allowedPaths.map((p) => normalizeScopedPath(p)))];
  if (paths.some((p) => p === null)) {
    throw new DbError("validation_error", "one or more paths are not valid absolute URL paths");
  }
  const clean = paths as string[];

  const permission = await grantSitePermission(deps.db, {
    workspaceId: workspace.id,
    targetId: target.id,
    actorUserId: deps.session.userId,
    allowedPaths: clean,
    consentVersion: CONSENT_VERSION_V1,
    consentText: CONSENT_TEXT,
  });
  return { status: 201, body: { data: mapPermission(permission) } };
}

export async function revokeSitePermissionFlow(
  deps: BffDeps,
  workspaceId: string,
  targetId: string,
): Promise<RouteResult> {
  requireAccount(deps);
  const workspace = await authorizeWorkspace(deps.db, deps.session, workspaceId);
  const target = await getTarget(deps.db, workspace.id, targetId);
  if (!target) throw DbError.notFound("target", targetId);
  const n = await revokeSitePermission(
    deps.db,
    workspace.id,
    target.id,
    deps.session.userId,
    requestTime(deps),
  );
  return { status: 200, body: { data: { revoked: n } } };
}

export async function runPassiveReconFlow(
  deps: BffDeps,
  workspaceId: string,
  targetId: string,
): Promise<RouteResult> {
  requireAccount(deps);
  const workspace = await authorizeWorkspace(deps.db, deps.session, workspaceId);
  const target = await getTarget(deps.db, workspace.id, targetId);
  if (!target) throw DbError.notFound("target", targetId);
  if (target.state !== "verified") {
    throw new DbError("policy_denied", "recon requires a verified target");
  }
  const now = requestTime(deps);
  const permission = await getActiveSitePermission(deps.db, workspace.id, target.id, now);
  if (!permission) {
    throw new DbError(
      "policy_denied",
      "no active permission — explicit consent + permitted paths are required before recon",
    );
  }

  const dayAgo = new Date(now.getTime() - 86400_000);
  const recent = await countRecentReconRuns(deps.db, workspace.id, target.id, dayAgo);
  if (recent >= RECON_RUNS_PER_DAY) {
    throw new DbError(
      "rate_limited",
      `passive recon limited to ${RECON_RUNS_PER_DAY} runs per site per day`,
    );
  }

  const run = await createReconRun(deps.db, {
    workspaceId: workspace.id,
    targetId: target.id,
    permissionId: permission.id,
    runBy: deps.session.userId,
  });

  const { resolver, fetcher } = reconDeps(deps);
  try {
    const result = await runPassiveRecon({
      canonicalOrigin: target.canonicalOrigin,
      allowedPaths: permission.allowedPaths,
      resolver,
      fetcher,
    });
    const observations = analyzePassivePages(target.canonicalOrigin, result.pages);
    const limitations = [
      ...standardLimitations(permission.allowedPaths.length),
      ...result.limitations,
    ];
    await addReconObservations(deps.db, run.id, observations);
    await finishReconRun(deps.db, run.id, {
      status: result.pages.length === 0 ? "failed" : "completed",
      requestCount: result.requestCount,
      bytesReceived: result.bytesReceived,
      limitations,
      completedAt: now,
    });
    const fresh = await getReconRun(deps.db, workspace.id, run.id);
    return {
      status: 200,
      body: { data: mapRun(fresh!, observations.map(rowToObs)) },
    };
  } catch (err) {
    const code = err instanceof ReconError ? err.code : "unreachable";
    const detail =
      err instanceof ReconError ? (err.userReason ?? err.message) : "recon could not be completed";
    const status: PassiveReconStatus =
      code === "unreachable" || code === "dns_failed" || code === "tls_failed" || code === "timeout"
        ? "unreachable"
        : code === "quota_exceeded"
          ? "quota_limited"
          : "failed";
    await finishReconRun(deps.db, run.id, {
      status,
      requestCount: 0,
      bytesReceived: 0,
      limitations: standardLimitations(0),
      errorCode: code,
      errorDetail: detail.slice(0, 500),
      completedAt: now,
    });
    await updateTargetVerificationState(deps.db, workspace.id, target.id, {
      verificationStatus: status === "unreachable" ? "unreachable" : target.verificationStatus,
    });
    const fresh = await getReconRun(deps.db, workspace.id, run.id);
    return { status: 200, body: { data: mapRun(fresh!, []) } };
  }
}

export async function getPassiveReconFlow(
  deps: BffDeps,
  workspaceId: string,
  targetId: string,
  runId: string | null,
): Promise<RouteResult> {
  requireAccount(deps);
  const workspace = await authorizeWorkspace(deps.db, deps.session, workspaceId);
  const target = await getTarget(deps.db, workspace.id, targetId);
  if (!target) throw DbError.notFound("target", targetId);
  const run = runId
    ? await getReconRun(deps.db, workspace.id, runId)
    : await getLatestReconRun(deps.db, workspace.id, target.id);
  if (!run) throw DbError.notFound("recon run", runId ?? "latest");
  const obs = await listReconObservations(deps.db, run.id);
  return { status: 200, body: { data: mapRun(run, obs) } };
}

// --- mapping helpers ---------------------------------------------------------

function mapVerification(v: {
  status: string;
  expiresAt: Date;
  dnsRecordName: string;
  dnsTxtValue: string;
  wellKnownUrl: string;
  wellKnownExpectedBody: string;
  method: string | null;
  verifiedAt: Date | null;
}) {
  return {
    status: v.status,
    expiresAt: v.expiresAt.toISOString(),
    dnsRecordName: v.dnsRecordName,
    dnsTxtValue: v.dnsTxtValue,
    wellKnownUrl: v.wellKnownUrl,
    wellKnownExpectedBody: v.wellKnownExpectedBody,
    method: v.method,
    verifiedAt: v.verifiedAt?.toISOString() ?? null,
  };
}

function mapPermission(p: {
  id: string;
  allowedPaths: string[];
  consentVersion: string;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: p.id,
    allowedPaths: p.allowedPaths,
    consentVersion: p.consentVersion,
    grantedAt: p.grantedAt.toISOString(),
    expiresAt: p.expiresAt?.toISOString() ?? null,
    revokedAt: p.revokedAt?.toISOString() ?? null,
    active: p.revokedAt === null,
  };
}

type ObsRow = {
  kind: string;
  name: string;
  observed: boolean;
  detail: string | null;
  severity: string;
};

function rowToObs(o: ObsRow): PassiveObservation {
  return {
    kind: o.kind as PassiveObservation["kind"],
    name: o.name,
    observed: o.observed,
    detail: o.detail,
    severity: o.severity as PassiveObservation["severity"],
  };
}

function mapRun(
  run: {
    id: string;
    targetId: string;
    status: string;
    requestCount: number;
    bytesReceived: number;
    startedAt: Date;
    completedAt: Date | null;
    limitations: unknown;
    errorCode: string | null;
  },
  obs: ObsRow[],
) {
  return {
    runId: run.id,
    targetId: run.targetId,
    status: run.status,
    requestCount: run.requestCount,
    bytesReceived: run.bytesReceived,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    observations: obs.map(rowToObs),
    limitations: Array.isArray(run.limitations) ? (run.limitations as string[]) : [],
    errorCode: run.errorCode,
  };
}

async function latestPermissionAny(deps: BffDeps, workspaceId: string, targetId: string) {
  return getLatestSitePermission(deps.db, workspaceId, targetId);
}

function deriveBuilderStatus(
  state: string,
  verification: { status: string } | null,
  permission: unknown,
  anyPermission: { revokedAt: Date | null } | null,
  lastRun: { status: string } | null,
): BuilderTargetStatus {
  if (verification?.status === "unreachable" || lastRun?.status === "unreachable") {
    return "unreachable";
  }
  if (state === "verified" && permission) return "verified";
  if (state === "verified" && anyPermission?.revokedAt) return "permission_revoked";
  return "pending_verification";
}
