import {
  TestPackIdSchema,
  TestPackMethodSchema,
  type AuthorizationScope,
  type Environment,
  type Project,
  type ScanEvent,
  type Target,
} from "@highcastle/contracts";
import { DbError } from "@highcastle/db";

/**
 * Drizzle-row → contract mappers. L02 rows carry `Date` objects and plain
 * strings; the wire carries ISO-8601 strings and branded UUIDs. Mapping is
 * explicit (never a blind cast) so a schema drift fails fast here.
 */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function mapScope(row: {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  version: number;
  actorUserId: string;
  status: AuthorizationScope["status"];
  allowedHosts: string[];
  allowedPaths: string[];
  deniedPaths: string[];
  allowedTestPackIds: string[];
  allowedMethods: string[];
  maxDurationSeconds: number;
  maxRequests: number;
  maxConcurrency: number;
  maxMemoryMb: number;
  maxCpuMillicores: number | null;
  networkProfileId: string | null;
  permittedEnvironmentId: string;
  approvedAt: Date | string;
  expiresAt: Date | string;
  scopeHash: string;
}): AuthorizationScope {
  // Enumerated columns are validated on the way out: a stored value outside
  // the contract enum is data corruption, not a new feature.
  const packIds = row.allowedTestPackIds.map((packId) => {
    const parsed = TestPackIdSchema.safeParse(packId);
    if (!parsed.success) {
      throw new DbError("internal", "stored scope names an unknown test pack");
    }
    return parsed.data;
  });
  const methods = row.allowedMethods.map((method) => {
    const parsed = TestPackMethodSchema.safeParse(method);
    if (!parsed.success) {
      throw new DbError("internal", "stored scope names an unknown method");
    }
    return parsed.data;
  });
  return {
    id: row.id as AuthorizationScope["id"],
    workspaceId: row.workspaceId as AuthorizationScope["workspaceId"],
    projectId: row.projectId as AuthorizationScope["projectId"],
    targetId: row.targetId as AuthorizationScope["targetId"],
    version: row.version,
    actorUserId: row.actorUserId as AuthorizationScope["actorUserId"],
    status: row.status,
    allowedHosts: [...row.allowedHosts],
    allowedPaths: [...row.allowedPaths],
    deniedPaths: [...row.deniedPaths],
    allowedTestPackIds: packIds,
    allowedMethods: methods,
    maxDurationSeconds: row.maxDurationSeconds,
    maxRequests: row.maxRequests,
    maxConcurrency: row.maxConcurrency,
    maxMemoryMb: row.maxMemoryMb,
    networkProfileId: row.networkProfileId,
    permittedEnvironmentId:
      row.permittedEnvironmentId as AuthorizationScope["permittedEnvironmentId"],
    approvedAt: iso(row.approvedAt),
    expiresAt: iso(row.expiresAt),
    scopeHash: row.scopeHash as AuthorizationScope["scopeHash"],
  };
}

export function mapTarget(row: {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentId: string | null;
  label: string;
  canonicalOrigin: string;
  targetKind: Target["targetKind"];
  state: Target["state"];
  verificationStatus: string | null;
  verificationMethod: Target["verificationMethod"];
  verifiedBy: string | null;
  verifiedAt: Date | string | null;
  verificationExpiresAt: Date | string | null;
}): Target {
  return {
    id: row.id as Target["id"],
    workspaceId: row.workspaceId as Target["workspaceId"],
    projectId: row.projectId as Target["projectId"],
    environmentId: row.environmentId as Target["environmentId"],
    label: row.label,
    canonicalOrigin: row.canonicalOrigin,
    targetKind: row.targetKind,
    state: row.state,
    verificationStatus: row.verificationStatus,
    verificationMethod: row.verificationMethod,
    verifiedBy: row.verifiedBy as Target["verifiedBy"],
    verifiedAt: row.verifiedAt === null ? null : iso(row.verifiedAt),
    verificationExpiresAt:
      row.verificationExpiresAt === null ? null : iso(row.verificationExpiresAt),
  };
}

export function mapEnvironment(row: {
  id: string;
  workspaceId: string;
  projectId: string;
  label: string;
  kind: Environment["kind"];
  currentRevision: string;
  fixtureVersion: Environment["fixtureVersion"];
  provisionStatus: Environment["provisionStatus"];
  networkProfileId: string | null;
  createdAt: Date | string;
  destroyedAt: Date | string | null;
}): Environment {
  return {
    id: row.id as Environment["id"],
    workspaceId: row.workspaceId as Environment["workspaceId"],
    projectId: row.projectId as Environment["projectId"],
    label: row.label,
    kind: row.kind,
    currentRevision: row.currentRevision,
    fixtureVersion: row.fixtureVersion,
    provisionStatus: row.provisionStatus,
    networkProfileId: row.networkProfileId,
    createdAt: iso(row.createdAt),
    destroyedAt: row.destroyedAt === null ? null : iso(row.destroyedAt),
  };
}

export function mapProject(row: {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  kind: Project["kind"];
  lifecycle: Project["lifecycle"];
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  archivedAt: Date | string | null;
}): Project {
  return {
    id: row.id as Project["id"],
    workspaceId: row.workspaceId as Project["workspaceId"],
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind,
    lifecycle: row.lifecycle,
    createdBy: row.createdBy as Project["createdBy"],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    archivedAt: row.archivedAt === null ? null : iso(row.archivedAt),
  };
}

export function mapScanEvent(row: {
  id: string;
  workspaceId: string;
  scanId: string;
  seq: number;
  // No schema_version column exists; every stored event conforms to
  // contract version 1 by construction (validated on write by L17).
  eventType: ScanEvent["eventType"];
  phase: ScanEvent["phase"];
  actorType: ScanEvent["actorType"];
  safeSummary: string;
  payloadRedacted: unknown;
  attemptId: string | null;
  occurredAt: Date | string;
}): ScanEvent {
  return {
    id: row.id as ScanEvent["id"],
    workspaceId: row.workspaceId as ScanEvent["workspaceId"],
    scanId: row.scanId as ScanEvent["scanId"],
    seq: row.seq,
    schemaVersion: 1,
    eventType: row.eventType,
    phase: row.phase,
    actorType: row.actorType,
    safeSummary: row.safeSummary,
    payloadRedacted: (row.payloadRedacted ?? {}) as Record<string, unknown>,
    attemptId: row.attemptId as ScanEvent["attemptId"],
    occurredAt: iso(row.occurredAt),
  };
}
