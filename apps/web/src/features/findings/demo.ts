/**
 * Labeled synthetic demo source (L10).
 *
 * Server-only: imports `@highcastle/test-packs` (Node crypto) and must
 * never be bundled into a client component.
 *
 * When the BFF API is unavailable (L18 not yet landed) or the user opens
 * the demo finding, pages render THIS dataset — computed with the real
 * production oracle over recorded synthetic observations, and always
 * labeled "Synthetic demo data" in the UI. Verdicts are derived, never
 * hardcoded: `reproduced` on the vulnerable record, `verified_fixed` on
 * the patched replay.
 */

import { AttemptIdSchema } from "@highcastle/contracts";
import {
  adjudicateAttempt,
  adjudicateReplay,
  buildReplayRecord,
  sanitizeBodyExcerpt,
  sha256Hex,
  type BolaAttemptAdjudication,
  type BolaAttemptInput,
  type PackRunResult,
} from "@highcastle/test-packs";
import type {
  AttemptRecord,
  DataSource,
  FindingDetail,
  FindingSummary,
  ProofLeg,
  ReplayRecord,
} from "./types";

export const DEMO_FINDING_ID = "demo-bola-invoice";
export const DEMO_REPLAY_ID = "demo-replay-1";

export const DEMO_SOURCE: DataSource = {
  kind: "demo",
  note: "Synthetic demo data — computed with the production oracle from recorded observations, not a live backend.",
};

const VULN_ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const PATCHED_ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";

function observed(status: number, body: unknown, revision: string) {
  const bodyText = JSON.stringify(body);
  return { status, bodyText, body, revisionEcho: revision };
}

function aliceBody(revision: string) {
  return {
    invoice: {
      id: "invoice_A",
      number: "INV-2026-0001",
      tenantId: "tenant_A",
      ownerId: "user_A",
    },
    meta: { revision, requestId: "demo-p1" },
  };
}

function bobBody(revision: string) {
  return {
    invoice: {
      id: "invoice_B",
      number: "INV-2026-0002",
      tenantId: "tenant_B",
      ownerId: "user_B",
    },
    meta: { revision, requestId: "demo-s1" },
  };
}

function deniedBody(revision: string) {
  return {
    error: { code: "INVOICE_NOT_FOUND", message: "No invoice is visible to this account." },
    meta: { revision, requestId: "demo-s1" },
  };
}

function metaBody(revision: string) {
  return {
    service: "highcastle-target-lab",
    revision,
    fixtureVersion: "1.0.0",
    fixtureSet: "alice-bob-invoices",
    fixtures: {
      invoices: [
        { id: "invoice_A", ownerId: "user_A", tenantId: "tenant_A" },
        { id: "invoice_B", ownerId: "user_B", tenantId: "tenant_B" },
      ],
    },
  };
}

function attemptInput(
  attemptId: string,
  revision: "lab-v1-vulnerable" | "lab-v2-patched",
  cross: "bob" | "denied",
): BolaAttemptInput {
  return {
    attemptId,
    expectedRevision: revision,
    health: observed(200, { status: "ok", revision }, revision),
    ready: observed(200, { status: "ready", revision }, revision),
    meta: observed(200, metaBody(revision), revision),
    ownInvoice: observed(200, aliceBody(revision), revision),
    crossInvoice: observed(
      cross === "bob" ? 200 : 404,
      cross === "bob" ? bobBody(revision) : deniedBody(revision),
      revision,
    ),
  };
}

function toLeg(
  leg: "P1" | "S1",
  path: string,
  response: { status: number; bodyText: string; body: unknown },
): ProofLeg {
  const sanitized = sanitizeBodyExcerpt(response.bodyText);
  const body = response.body as {
    invoice?: { id: string; ownerId: string; tenantId: string };
  } | null;
  return {
    leg,
    method: "GET",
    path,
    status: response.status,
    bodyHash: sha256Hex(sanitized),
    excerptRedacted: sanitized,
    identity:
      body !== null && typeof body === "object" && body.invoice
        ? {
            id: body.invoice.id,
            ownerId: body.invoice.ownerId,
            tenantId: body.invoice.tenantId,
          }
        : null,
  };
}

function toAttemptRecord(
  input: BolaAttemptInput,
  adjudication: BolaAttemptAdjudication,
): AttemptRecord {
  return {
    attemptId: input.attemptId,
    scanId: "demo-scan-1",
    packId: "bola-invoice-v1",
    packVersion: "1.0.0",
    oracleVersion: "bola-oracle-v1",
    targetRevision: input.expectedRevision,
    fixtureVersion: "1.0.0",
    baseline: toLeg("P1", "/api/invoices/invoice_A", input.ownInvoice),
    crossAccount: toLeg("S1", "/api/invoices/invoice_B", input.crossInvoice),
    verdict: adjudication.verdict,
    verdictReasons: adjudication.reasons,
  };
}

const VULNERABLE_INPUT = attemptInput(VULN_ATTEMPT_ID, "lab-v1-vulnerable", "bob");
const PATCHED_INPUT = attemptInput(PATCHED_ATTEMPT_ID, "lab-v2-patched", "denied");

const VULNERABLE_ADJUDICATION = adjudicateAttempt(VULNERABLE_INPUT);
const PATCHED_ADJUDICATION = adjudicateAttempt(PATCHED_INPUT);
const VULNERABLE_ATTEMPT = toAttemptRecord(VULNERABLE_INPUT, VULNERABLE_ADJUDICATION);
const PATCHED_ATTEMPT = toAttemptRecord(PATCHED_INPUT, PATCHED_ADJUDICATION);
const REPLAY_ADJUDICATION = adjudicateReplay(PATCHED_ADJUDICATION);
const REPLAY_RECORD = buildReplayRecord(
  toRunShell(VULNERABLE_INPUT, VULNERABLE_ADJUDICATION),
  toRunShell(PATCHED_INPUT, PATCHED_ADJUDICATION),
  REPLAY_ADJUDICATION,
);

function toRunShell(input: BolaAttemptInput, adjudication: BolaAttemptAdjudication): PackRunResult {
  const attemptId = AttemptIdSchema.parse(input.attemptId);
  return {
    attemptId,
    startedAt: "2026-11-06T12:00:00.000Z",
    completedAt: "2026-11-06T12:00:04.000Z",
    expectedRevision: input.expectedRevision,
    observedRevision: input.expectedRevision,
    observedFixtureVersion: "1.0.0",
    requestCount: 7,
    durationMs: 4000,
    budgetExceeded: false,
    setupOk: true,
    exchanges: [],
    ownEvidence: null,
    crossEvidence: null,
    adjudication,
    verificationVerdict: {
      attemptId,
      oracleVersion: adjudication.oracleVersion,
      baseline: adjudication.baseline,
      securityCheck: adjudication.securityCheck,
      verdict: adjudication.verdict,
    },
  };
}

export function demoFindingSummary(): FindingSummary {
  return {
    id: DEMO_FINDING_ID,
    title: "Cross-account invoice read (BOLA)",
    category: "broken_object_authorization",
    severity: "high",
    confidence: "confirmed_by_execution",
    remediationStatus: "open",
    firstSeenAt: "2026-11-06T12:00:04.000Z",
    lastSeenAt: "2026-11-06T12:00:04.000Z",
  };
}

export function demoFindingDetail(): FindingDetail {
  return {
    finding: {
      ...demoFindingSummary(),
      summary:
        "Alice's authenticated session retrieved Bob's private synthetic invoice (invoice_B) by known ID on lab-v1-vulnerable. The patched revision denies the cross-account read while Alice's own read keeps working.",
      stableFingerprint: "bola:invoice_lookup:owner_check",
    },
    attempt: VULNERABLE_ATTEMPT,
    patchedAttempt: PATCHED_ATTEMPT,
    fixGuidance: {
      rootCause:
        "Invoice lookup uses the request ID alone; the tenant/ownership check is missing on the read path.",
      smallestFix:
        "Scope the lookup to the authenticated actor's tenant (findByIdForTenant(id, actor.tenantId)) and return 404 INVOICE_NOT_FOUND for cross-tenant IDs.",
      requiredInvariants: [
        "Every invoice read is scoped to the authenticated actor's tenant.",
        "Cross-tenant IDs are indistinguishable from missing objects (404).",
        "Authentication is still required on every invoice route.",
      ],
      testGuidance:
        "Replay pack bola-invoice-v1 on the patched revision: Alice reads invoice_A (200), Alice reads invoice_B (denied), then mark verified_fixed only on both.",
      provenance: "local",
    },
    replay: {
      replayId: DEMO_REPLAY_ID,
      originalAttemptId: REPLAY_RECORD.originalAttemptId,
      replayAttemptId: REPLAY_RECORD.replayAttemptId,
      packVersion: REPLAY_RECORD.packVersion,
      originalRevision: REPLAY_RECORD.originalExpectedRevision,
      patchedRevision: REPLAY_RECORD.replayExpectedRevision,
      originalVerdict: REPLAY_RECORD.originalVerdict,
      replayAttemptVerdict: REPLAY_RECORD.replayAttemptVerdict,
      verdict: REPLAY_RECORD.replayVerdict,
      completedAt: "2026-11-06T12:05:00.000Z",
      assertions: { positivePassed: true, negativeDenied: true },
    },
    replayDefaults: {
      patchedEnvironmentId: "demo-patched-env",
      patchedRevision: "lab-v2-patched",
      authorizationScopeId: "demo-scope",
    },
    source: DEMO_SOURCE,
  };
}

export function demoReplayRecord(): ReplayRecord {
  const detail = demoFindingDetail();
  if (detail.replay === null) throw new Error("demo replay missing");
  return detail.replay;
}

export function demoPatchedAttempt(): AttemptRecord {
  return PATCHED_ATTEMPT;
}
