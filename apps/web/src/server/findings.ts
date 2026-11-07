import {
  FindingOccurrenceSchema,
  FindingSchema,
  FixPromptResponseSchema,
  type Finding,
  type Severity,
} from "@highcastle/contracts";
import { getAttempt, getFinding, listFindingOccurrences, listFindings } from "@highcastle/db";
import { DbError } from "@highcastle/db";
import type { BffDeps } from "./deps";
import { authorizeProject } from "./authz";
import type { RouteResult } from "./scans";

/**
 * Findings flows. Reads are workspace-scoped; every finding/occurrence
 * response is validated against the canonical contract before it leaves the
 * server, so the dashboard and findings UI can parse strictly. The fix
 * prompt is derived deterministically from the recorded finding and its
 * confirming attempt — never from a model, and never a bare "looks fixed"
 * claim.
 */

function toFindingContract(row: {
  id: string;
  workspaceId: string;
  projectId: string;
  stableFingerprint: string;
  title: string;
  summary: string;
  category: string;
  severity: string;
  confidence: string;
  remediationStatus: string;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  latestConfirmedAttemptId: string | null;
  ownerUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Finding {
  const parsed = FindingSchema.safeParse({
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    stableFingerprint: row.stableFingerprint,
    title: row.title,
    summary: row.summary,
    category: row.category,
    severity: row.severity,
    confidence: row.confidence,
    remediationStatus: row.remediationStatus,
    firstSeenAt: iso(row.firstSeenAt),
    lastSeenAt: iso(row.lastSeenAt),
    latestConfirmedAttemptId: row.latestConfirmedAttemptId,
    ownerUserId: row.ownerUserId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  });
  if (!parsed.success) {
    throw new DbError("internal", "stored finding failed contract validation", {
      findingId: row.id,
    });
  }
  return parsed.data;
}

const SEVERITIES = ["critical", "high", "medium", "low", "informational"] as const;
const CONFIDENCES = [
  "suspected",
  "supported_by_analysis",
  "confirmed_by_execution",
  "not_reproduced",
  "inconclusive",
] as const;

export async function listFindingsFlow(
  deps: BffDeps,
  input: {
    workspaceId: string;
    projectId: string;
    severity?: string;
    remediationStatus?: string;
    confidence?: string;
  },
): Promise<RouteResult> {
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  if (input.severity !== undefined && !SEVERITIES.includes(input.severity as (typeof SEVERITIES)[number])) {
    throw new DbError("validation_error", "invalid severity filter");
  }
  if (
    input.confidence !== undefined &&
    !CONFIDENCES.includes(input.confidence as (typeof CONFIDENCES)[number])
  ) {
    throw new DbError("validation_error", "invalid confidence filter");
  }
  const rows = await listFindings(deps.db, input.workspaceId, {
    projectId: input.projectId,
    ...(input.severity === undefined
      ? {}
      : { severity: input.severity as Severity }),
    ...(input.remediationStatus === undefined
      ? {}
      : {
          remediationStatus:
            input.remediationStatus as Finding["remediationStatus"],
        }),
  });
  const data = rows
    .filter((row) =>
      input.confidence === undefined ? true : row.confidence === input.confidence,
    )
    .map((row) => toFindingContract(row));
  return { status: 200, body: { data } };
}

export async function getFindingFlow(
  deps: BffDeps,
  input: { findingId: string; workspaceId: string },
): Promise<RouteResult> {
  const row = await getFinding(deps.db, input.workspaceId, input.findingId);
  if (!row) throw DbError.notFound("finding", input.findingId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  return { status: 200, body: { data: toFindingContract(row) } };
}

export async function listOccurrencesFlow(
  deps: BffDeps,
  input: { findingId: string; workspaceId: string },
): Promise<RouteResult> {
  const row = await getFinding(deps.db, input.workspaceId, input.findingId);
  if (!row) throw DbError.notFound("finding", input.findingId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  const occurrences = await listFindingOccurrences(
    deps.db,
    input.workspaceId,
    input.findingId,
  );
  const data = occurrences.map((occurrence) => {
    const parsed = FindingOccurrenceSchema.safeParse({
      id: occurrence.id,
      workspaceId: occurrence.workspaceId,
      findingId: occurrence.findingId,
      scanId: occurrence.scanId,
      attemptId: occurrence.attemptId,
      sourceRevision: occurrence.sourceRevision,
      targetRevision: occurrence.targetRevision,
      evidenceConfidence: occurrence.evidenceConfidence,
      observedAt: iso(occurrence.observedAt),
      oracleVerdict: occurrence.oracleVerdict,
    });
    if (!parsed.success) {
      throw new DbError("internal", "stored occurrence failed contract validation", {
        findingId: input.findingId,
      });
    }
    return parsed.data;
  });
  return { status: 200, body: { data } };
}

const BOLA_INVARIANTS = [
  "Enforce authenticated ownership on every invoice read: the session owner must equal the invoice owner",
  "Deny cross-tenant reads by default; an absent ownership check is a vulnerability, not a fallback to allow",
  "Positive control: the owner reads their own invoice successfully (HTTP 200)",
  "Negative control: a cross-owner read is denied (HTTP 403 or 404) without disclosing the other tenant's data",
] as const;

export async function fixPromptFlow(
  deps: BffDeps,
  input: { findingId: string; workspaceId: string },
): Promise<RouteResult> {
  const row = await getFinding(deps.db, input.workspaceId, input.findingId);
  if (!row) throw DbError.notFound("finding", input.findingId);
  await authorizeProject(deps.db, deps.session, input.workspaceId, row.projectId);
  let observed = "No recorded execution evidence yet.";
  if (row.latestConfirmedAttemptId) {
    const attempt = await getAttempt(
      deps.db,
      input.workspaceId,
      row.latestConfirmedAttemptId,
    );
    if (attempt) {
      observed =
        `Recorded execution (attempt ${attempt.id}, pack ${attempt.packId} ` +
        `${attempt.packVersion}, oracle ${attempt.oracleVersion ?? "unknown"}): ` +
        `verdict ${attempt.verifierVerdict ?? "pending"}.`;
    }
  }
  const response = FixPromptResponseSchema.parse({
    findingId: row.id,
    rootCause:
      `${row.title}. ${row.summary} Category: ${row.category}. ${observed}`,
    smallestFix:
      "Add an ownership predicate to the invoice lookup so the query filters " +
      "by both invoice id and the authenticated tenant, and return 403 when " +
      "the row belongs to another tenant. Do not rely on unguessable ids " +
      "alone; ids are not authorization.",
    requiredInvariants: [...BOLA_INVARIANTS],
    testGuidance:
      "Re-run the bounded bola-invoice-v1 pack against the patched revision: " +
      "the owner's own read must succeed and the cross-owner read must be " +
      "denied. Only a passing replay marks this verified_fixed.",
  });
  return { status: 200, body: { data: response } };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
