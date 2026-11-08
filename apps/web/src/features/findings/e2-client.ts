/**
 * Engineer 2 BFF integration client (L10).
 *
 * E2's API serves documented PARTIAL projections of the canonical rows —
 * not the full strict contract objects — plus endpoint-specific views
 * (occurrences, stored attempts, replay view, current scope). This module
 * validates exactly what E2 serves, field by field, using the canonical
 * contract validators (no locally invented enums or ID formats).
 *
 * Served today (transcribed from `feature/l18-api-bff`):
 * - GET .../projects/:pid/findings → `{ data: [...] }` rows WITHOUT
 *   workspaceId/ownerUserId/createdAt/updatedAt.
 * - GET .../findings/:fid → the same row PLUS projectId and
 *   latestConfirmedAttemptId (still no workspace/owner/timestamps).
 * - GET .../findings/:fid/occurrences → attempt pointers with oracle
 *   verdicts and target revisions.
 * - GET .../attempts/:aid → stored attempt with control outcomes and
 *   redacted evidence metadata (digests only; bytes need object storage).
 * - GET .../replays/:rid → replay VIEW (not the Replay row): server
 *   verdict, assertion booleans, original + replay attempt pointers.
 * - GET .../projects/:pid/authorization-scopes/current → scope plus the
 *   permitted environment (id + currentRevision) for replay initiation.
 *
 * Absent fields are recorded as absent (`null`), never invented. Malformed
 * fields reject the whole payload. If E2 later serves full `Finding`
 * rows, the strict `FindingSchema` path in `api-client.ts` takes over
 * with no UI change.
 */

import {
  AttemptIdSchema,
  AttemptStatusSchema,
  AuthorizationScopeIdSchema,
  ConfidenceSchema,
  EnvironmentIdSchema,
  EvidenceArtifactIdSchema,
  EvidenceArtifactKindSchema,
  FindingCategorySchema,
  FindingIdSchema,
  FindingOccurrenceIdSchema,
  OracleVerdictSchema,
  ProjectIdSchema,
  ReplayIdSchema,
  ReplayVerdictSchema,
  RemediationStatusSchema,
  ReplayRequestSchema,
  ScanIdSchema,
  ScopeStatusSchema,
  SeveritySchema,
  TestPackIdSchema,
  type AttemptId,
  type AttemptStatus,
  type AuthorizationScopeId,
  type Confidence,
  type EnvironmentId,
  type EvidenceArtifactId,
  type EvidenceArtifactKind,
  type FindingCategory,
  type FindingId,
  type OracleVerdict,
  type ProjectId,
  type RemediationStatus,
  type ReplayId,
  type ReplayVerdict,
  type ScanId,
  type ScopeStatus,
  type Severity,
  type TestPackId,
} from "@highcastle/contracts";
import { envelopeData, httpStatus, readJson, type FetchImpl } from "./api-client";
import type { LoadState } from "./types";

export interface PartialFindingRow {
  id: FindingId;
  projectId: ProjectId | null;
  stableFingerprint: string;
  title: string;
  summary: string;
  category: FindingCategory;
  severity: Severity;
  confidence: Confidence;
  remediationStatus: RemediationStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  latestConfirmedAttemptId: AttemptId | null;
}

export interface OccurrenceRow {
  id: string;
  scanId: ScanId;
  attemptId: AttemptId;
  targetRevision: string;
  evidenceConfidence: Confidence;
  observedAt: string;
  oracleVerdict: OracleVerdict;
}

export interface ArtifactMeta {
  id: EvidenceArtifactId;
  artifactKind: EvidenceArtifactKind;
  sha256: string;
  byteSize: number;
  contentType: string;
}

export interface StoredAttemptRow {
  id: AttemptId;
  scanId: ScanId;
  packId: TestPackId;
  packVersion: string;
  status: AttemptStatus;
  verdict: OracleVerdict | null;
  positiveControlPassed: boolean | null;
  negativeSecurityConditionMet: boolean | null;
  startedAt: string | null;
  endedAt: string | null;
  evidence: ArtifactMeta[];
}

export interface ScopeEnvInfo {
  id: EnvironmentId;
  label: string;
  currentRevision: string;
  fixtureVersion: string;
}

export interface ScopeInfo {
  id: AuthorizationScopeId;
  projectId: ProjectId;
  status: ScopeStatus;
  permittedEnvironmentId: EnvironmentId;
  permittedEnvironment: ScopeEnvInfo | null;
}

export interface ReplayAttemptPointer {
  id: AttemptId;
  packId: TestPackId;
  verdict: OracleVerdict | null;
}

export interface ReplayViewRow {
  id: ReplayId;
  findingId: FindingId;
  verdict: ReplayVerdict | null;
  patchedRevision: string;
  packId: TestPackId;
  packVersion: string;
  positiveAssertionPassed: boolean | null;
  negativeAssertionPassed: boolean | null;
  originalAttempt: ReplayAttemptPointer | null;
  replayAttempts: ReplayAttemptPointer[];
}

type Parsed<T> = { ok: true; value: T } | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Contract schema bound as a nullable validator. */
function via<T>(parse: (raw: unknown) => { success: boolean; data?: T }) {
  return (value: unknown): T | null => {
    const parsed = parse(value);
    return parsed.success && parsed.data !== undefined ? parsed.data : null;
  };
}

const str = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const bool = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;
const num = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

/** Required field: missing or malformed rejects the row. */
function req<T>(
  obj: Record<string, unknown>,
  key: string,
  parse: (raw: unknown) => T | null,
): Parsed<T> {
  if (!(key in obj)) return { ok: false };
  const value = parse(obj[key]);
  return value === null ? { ok: false } : { ok: true, value };
}

/** Optional field: absent/null → null, malformed → reject. */
function opt<T>(
  obj: Record<string, unknown>,
  key: string,
  parse: (raw: unknown) => T | null,
): Parsed<T | null> {
  if (!(key in obj)) return { ok: true, value: null };
  const raw = obj[key];
  if (raw === null) return { ok: true, value: null };
  const value = parse(raw);
  return value === null ? { ok: false } : { ok: true, value };
}

const vFindingId = via(FindingIdSchema.safeParse.bind(FindingIdSchema));
const vProjectId = via(ProjectIdSchema.safeParse.bind(ProjectIdSchema));
const vAttemptId = via(AttemptIdSchema.safeParse.bind(AttemptIdSchema));
const vScanId = via(ScanIdSchema.safeParse.bind(ScanIdSchema));
const vOccurrenceId = via(FindingOccurrenceIdSchema.safeParse.bind(FindingOccurrenceIdSchema));
const vEvidenceArtifactId = via(EvidenceArtifactIdSchema.safeParse.bind(EvidenceArtifactIdSchema));
const vReplayId = via(ReplayIdSchema.safeParse.bind(ReplayIdSchema));
const vAuthorizationScopeId = via(AuthorizationScopeIdSchema.safeParse.bind(AuthorizationScopeIdSchema));
const vEnvironmentId = via(EnvironmentIdSchema.safeParse.bind(EnvironmentIdSchema));
const vCategory = via(FindingCategorySchema.safeParse.bind(FindingCategorySchema));
const vSeverity = via(SeveritySchema.safeParse.bind(SeveritySchema));
const vConfidence = via(ConfidenceSchema.safeParse.bind(ConfidenceSchema));
const vRemediation = via(RemediationStatusSchema.safeParse.bind(RemediationStatusSchema));
const vOracleVerdict = via(OracleVerdictSchema.safeParse.bind(OracleVerdictSchema));
const vReplayVerdict = via(ReplayVerdictSchema.safeParse.bind(ReplayVerdictSchema));
const vAttemptStatus = via(AttemptStatusSchema.safeParse.bind(AttemptStatusSchema));
const vArtifactKind = via(EvidenceArtifactKindSchema.safeParse.bind(EvidenceArtifactKindSchema));
const vTestPackId = via(TestPackIdSchema.safeParse.bind(TestPackIdSchema));
const vScopeStatus = via(ScopeStatusSchema.safeParse.bind(ScopeStatusSchema));

function parsePartialFinding(data: unknown): PartialFindingRow | null {
  if (!isRecord(data)) return null;
  const id = req(data, "id", vFindingId);
  const title = req(data, "title", str);
  const stableFingerprint = req(data, "stableFingerprint", str);
  const summary = req(data, "summary", str);
  const category = req(data, "category", vCategory);
  const severity = req(data, "severity", vSeverity);
  const confidence = req(data, "confidence", vConfidence);
  const remediationStatus = req(data, "remediationStatus", vRemediation);
  const firstSeenAt = req(data, "firstSeenAt", str);
  const lastSeenAt = req(data, "lastSeenAt", str);
  const projectId = opt(data, "projectId", vProjectId);
  const latestConfirmedAttemptId = opt(data, "latestConfirmedAttemptId", vAttemptId);
  if (
    !id.ok || !title.ok || !stableFingerprint.ok || !summary.ok || !category.ok ||
    !severity.ok || !confidence.ok || !remediationStatus.ok || !firstSeenAt.ok ||
    !lastSeenAt.ok || !projectId.ok || !latestConfirmedAttemptId.ok
  ) {
    return null;
  }
  return {
    id: id.value,
    projectId: projectId.value,
    stableFingerprint: stableFingerprint.value,
    title: title.value,
    summary: summary.value,
    category: category.value,
    severity: severity.value,
    confidence: confidence.value,
    remediationStatus: remediationStatus.value,
    firstSeenAt: firstSeenAt.value,
    lastSeenAt: lastSeenAt.value,
    latestConfirmedAttemptId: latestConfirmedAttemptId.value,
  };
}

function parseOccurrence(data: unknown): OccurrenceRow | null {
  if (!isRecord(data)) return null;
  const id = req(data, "id", vOccurrenceId);
  const scanId = req(data, "scanId", vScanId);
  const attemptId = req(data, "attemptId", vAttemptId);
  const targetRevision = req(data, "targetRevision", str);
  const evidenceConfidence = req(data, "evidenceConfidence", vConfidence);
  const observedAt = req(data, "observedAt", str);
  const oracleVerdict = req(data, "oracleVerdict", vOracleVerdict);
  if (
    !id.ok || !scanId.ok || !attemptId.ok || !targetRevision.ok ||
    !evidenceConfidence.ok || !observedAt.ok || !oracleVerdict.ok
  ) {
    return null;
  }
  return {
    id: id.value,
    scanId: scanId.value,
    attemptId: attemptId.value,
    targetRevision: targetRevision.value,
    evidenceConfidence: evidenceConfidence.value,
    observedAt: observedAt.value,
    oracleVerdict: oracleVerdict.value,
  };
}

function parseArtifact(data: unknown): ArtifactMeta | null {
  if (!isRecord(data)) return null;
  const id = req(data, "id", vEvidenceArtifactId);
  const artifactKind = req(data, "artifactKind", vArtifactKind);
  const sha256 = req(data, "sha256", str);
  const byteSize = req(data, "byteSize", num);
  const contentType = req(data, "contentType", str);
  if (!id.ok || !artifactKind.ok || !sha256.ok || !byteSize.ok || !contentType.ok) {
    return null;
  }
  return {
    id: id.value,
    artifactKind: artifactKind.value,
    sha256: sha256.value,
    byteSize: byteSize.value,
    contentType: contentType.value,
  };
}

function parseStoredAttempt(data: unknown): StoredAttemptRow | null {
  if (!isRecord(data)) return null;
  const id = req(data, "id", vAttemptId);
  const scanId = req(data, "scanId", vScanId);
  const packId = req(data, "packId", vTestPackId);
  const packVersion = req(data, "packVersion", str);
  const status = req(data, "status", vAttemptStatus);
  const verdict = opt(data, "verdict", vOracleVerdict);
  const positiveControlPassed = opt(data, "positiveControlPassed", bool);
  const negativeSecurityConditionMet = opt(data, "negativeSecurityConditionMet", bool);
  const startedAt = opt(data, "startedAt", str);
  const endedAt = opt(data, "endedAt", str);
  if (
    !id.ok || !scanId.ok || !packId.ok || !packVersion.ok || !status.ok ||
    !verdict.ok || !positiveControlPassed.ok || !negativeSecurityConditionMet.ok ||
    !startedAt.ok || !endedAt.ok
  ) {
    return null;
  }
  const evidenceRaw = data.evidence;
  if (!Array.isArray(evidenceRaw)) return null;
  const evidence: ArtifactMeta[] = [];
  for (const item of evidenceRaw) {
    const parsed = parseArtifact(item);
    if (parsed === null) return null;
    evidence.push(parsed);
  }
  return {
    id: id.value,
    scanId: scanId.value,
    packId: packId.value,
    packVersion: packVersion.value,
    status: status.value,
    verdict: verdict.value,
    positiveControlPassed: positiveControlPassed.value,
    negativeSecurityConditionMet: negativeSecurityConditionMet.value,
    startedAt: startedAt.value,
    endedAt: endedAt.value,
    evidence,
  };
}

function parseScope(data: unknown): ScopeInfo | null {
  if (!isRecord(data)) return null;
  const id = req(data, "id", vAuthorizationScopeId);
  const projectId = req(data, "projectId", vProjectId);
  const status = req(data, "status", vScopeStatus);
  const permittedEnvironmentId = req(data, "permittedEnvironmentId", vEnvironmentId);
  if (!id.ok || !projectId.ok || !status.ok || !permittedEnvironmentId.ok) return null;
  const envRaw = data.permittedEnvironment;
  let permittedEnvironment: ScopeEnvInfo | null = null;
  if (envRaw !== undefined && envRaw !== null) {
    if (!isRecord(envRaw)) return null;
    const envId = req(envRaw, "id", vEnvironmentId);
    const label = req(envRaw, "label", str);
    const currentRevision = req(envRaw, "currentRevision", str);
    const fixtureVersion = req(envRaw, "fixtureVersion", str);
    if (!envId.ok || !label.ok || !currentRevision.ok || !fixtureVersion.ok) return null;
    permittedEnvironment = {
      id: envId.value,
      label: label.value,
      currentRevision: currentRevision.value,
      fixtureVersion: fixtureVersion.value,
    };
  }
  return {
    id: id.value,
    projectId: projectId.value,
    status: status.value,
    permittedEnvironmentId: permittedEnvironmentId.value,
    permittedEnvironment,
  };
}

function parseAttemptPointer(data: unknown): ReplayAttemptPointer | null {
  if (!isRecord(data)) return null;
  const id = req(data, "id", vAttemptId);
  const packId = req(data, "packId", vTestPackId);
  const verdict = opt(data, "verdict", vOracleVerdict);
  if (!id.ok || !packId.ok || !verdict.ok) return null;
  return { id: id.value, packId: packId.value, verdict: verdict.value };
}

function parseReplayView(data: unknown): ReplayViewRow | null {
  if (!isRecord(data)) return null;
  const id = req(data, "id", vReplayId);
  const findingId = req(data, "findingId", vFindingId);
  const patchedRevision = req(data, "patchedRevision", str);
  const packId = req(data, "packId", vTestPackId);
  const packVersion = req(data, "packVersion", str);
  const verdict = opt(data, "verdict", vReplayVerdict);
  const positiveAssertionPassed = opt(data, "positiveAssertionPassed", bool);
  const negativeAssertionPassed = opt(data, "negativeAssertionPassed", bool);
  if (
    !id.ok || !findingId.ok || !patchedRevision.ok || !packId.ok || !packVersion.ok ||
    !verdict.ok || !positiveAssertionPassed.ok || !negativeAssertionPassed.ok
  ) {
    return null;
  }
  const originalRaw = data.originalAttempt;
  const originalAttempt =
    originalRaw === undefined || originalRaw === null ? null : parseAttemptPointer(originalRaw);
  if (originalAttempt === undefined) return null;
  const replayRaw = data.replayAttempts;
  if (!Array.isArray(replayRaw)) return null;
  const replayAttempts: ReplayAttemptPointer[] = [];
  for (const item of replayRaw) {
    const parsed = parseAttemptPointer(item);
    if (parsed === null) return null;
    replayAttempts.push(parsed);
  }
  return {
    id: id.value,
    findingId: findingId.value,
    verdict: verdict.value,
    patchedRevision: patchedRevision.value,
    packId: packId.value,
    packVersion: packVersion.value,
    positiveAssertionPassed: positiveAssertionPassed.value,
    negativeAssertionPassed: negativeAssertionPassed.value,
    originalAttempt: originalAttempt ?? null,
    replayAttempts,
  };
}

async function getOne<T>(
  fetchImpl: FetchImpl,
  url: string,
  parse: (data: unknown) => T | null,
): Promise<LoadState<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    return {
      status: "unavailable",
      detail: error instanceof Error ? error.message : "network failure",
    };
  }
  if (!response.ok) return httpStatus(response);
  const envelope = envelopeData(await readJson(response));
  if (!envelope.present) return { status: "unavailable", detail: "contract validation failed" };
  const parsed = parse(envelope.data);
  if (parsed === null) return { status: "unavailable", detail: "contract validation failed" };
  return { status: "ok", data: parsed, source: { kind: "api" } };
}

async function getList<T>(
  fetchImpl: FetchImpl,
  url: string,
  parseItem: (data: unknown) => T | null,
): Promise<LoadState<T[]>> {
  const state = await getOne<unknown>(fetchImpl, url, (data) => data);
  if (state.status !== "ok") return state;
  if (!Array.isArray(state.data)) {
    return { status: "unavailable", detail: "contract validation failed" };
  }
  const rows: T[] = [];
  for (const item of state.data) {
    const parsed = parseItem(item);
    if (parsed === null) return { status: "unavailable", detail: "contract validation failed" };
    rows.push(parsed);
  }
  return { status: "ok", data: rows, source: { kind: "api" } };
}

export function listE2Findings(
  baseUrl: string,
  projectId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<PartialFindingRow[]>> {
  return getList(
    fetchImpl,
    `${baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/findings`,
    parsePartialFinding,
  );
}

export function getE2Finding(
  baseUrl: string,
  findingId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<PartialFindingRow>> {
  return getOne(
    fetchImpl,
    `${baseUrl}/api/v1/findings/${encodeURIComponent(findingId)}`,
    parsePartialFinding,
  );
}

export function listE2Occurrences(
  baseUrl: string,
  findingId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<OccurrenceRow[]>> {
  return getList(
    fetchImpl,
    `${baseUrl}/api/v1/findings/${encodeURIComponent(findingId)}/occurrences`,
    parseOccurrence,
  );
}

export function getE2Attempt(
  baseUrl: string,
  attemptId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<StoredAttemptRow>> {
  return getOne(
    fetchImpl,
    `${baseUrl}/api/v1/attempts/${encodeURIComponent(attemptId)}`,
    parseStoredAttempt,
  );
}

export function getE2Scope(
  baseUrl: string,
  projectId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<ScopeInfo>> {
  return getOne(
    fetchImpl,
    `${baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/authorization-scopes/current`,
    parseScope,
  );
}

export function getE2ReplayView(
  baseUrl: string,
  replayId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<ReplayViewRow>> {
  return getOne(
    fetchImpl,
    `${baseUrl}/api/v1/replays/${encodeURIComponent(replayId)}`,
    parseReplayView,
  );
}

export interface StoredExplanationRow {
  attemptId: AttemptId;
  oracleVerdict: OracleVerdict;
  replayVerdict: ReplayVerdict | null;
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
}

const strArray = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every((item): item is string => typeof item === "string")
    ? [...raw]
    : null;

function parseStoredExplanation(data: unknown): StoredExplanationRow | null {
  if (!isRecord(data)) return null;
  const attemptId = req(data, "attemptId", vAttemptId);
  const oracleVerdict = req(data, "oracleVerdict", vOracleVerdict);
  const replayVerdict = opt(data, "replayVerdict", vReplayVerdict);
  const summary = opt(data, "summary", str);
  const whatHappened = opt(data, "whatHappened", str);
  const whyVerdict = opt(data, "whyVerdict", str);
  const replayMeaning = opt(data, "replayMeaning", str);
  const followUp = opt(data, "followUp", str);
  const evidenceIds = req(data, "evidenceIds", strArray);
  const requestedModel = req(data, "requestedModel", str);
  const responseModel = opt(data, "responseModel", str);
  const requestId = opt(data, "requestId", str);
  const latencyMs = opt(data, "latencyMs", num);
  const rejectionCode = opt(data, "rejectionCode", str);
  if (
    !attemptId.ok || !oracleVerdict.ok || !replayVerdict.ok || !summary.ok ||
    !whatHappened.ok || !whyVerdict.ok || !replayMeaning.ok || !followUp.ok ||
    !evidenceIds.ok || !requestedModel.ok || !responseModel.ok ||
    !requestId.ok || !latencyMs.ok || !rejectionCode.ok
  ) {
    return null;
  }
  return {
    attemptId: attemptId.value,
    oracleVerdict: oracleVerdict.value,
    replayVerdict: replayVerdict.value,
    summary: summary.value,
    whatHappened: whatHappened.value,
    whyVerdict: whyVerdict.value,
    replayMeaning: replayMeaning.value,
    followUp: followUp.value,
    evidenceIds: evidenceIds.value,
    requestedModel: requestedModel.value,
    responseModel: responseModel.value,
    requestId: requestId.value,
    latencyMs: latencyMs.value,
    rejectionCode: rejectionCode.value,
  };
}

/**
 * Latest stored explanation for one attempt. Any non-ok status (404 when
 * the worker has not stored one, 401/403, transport failure) or a
 * malformed body maps to null upstream — the panel renders its
 * unavailable state and the oracle verdict stands unchanged.
 */
export function getE2Explanation(
  baseUrl: string,
  attemptId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<LoadState<StoredExplanationRow>> {
  return getOne(
    fetchImpl,
    `${baseUrl}/api/v1/attempts/${encodeURIComponent(attemptId)}/explanation`,
    parseStoredExplanation,
  );
}

export interface ReplayAccept {
  replayId: ReplayId;
  findingId: FindingId;
  verdict: ReplayVerdict | null;
  patchedRevision: string;
}

function parseReplayAccept(data: unknown): ReplayAccept | null {
  if (!isRecord(data)) return null;
  const replayId = req(data, "replayId", vReplayId);
  const findingId = req(data, "findingId", vFindingId);
  const verdict = opt(data, "verdict", vReplayVerdict);
  const patchedRevision = req(data, "patchedRevision", str);
  if (!replayId.ok || !findingId.ok || !verdict.ok || !patchedRevision.ok) return null;
  return {
    replayId: replayId.value,
    findingId: findingId.value,
    verdict: verdict.value,
    patchedRevision: patchedRevision.value,
  };
}

/**
 * Initiate a replay against E2's actual accept-view. The request is
 * validated by the strict contract `ReplayRequestSchema` (client verdicts
 * rejected); the response is E2's `{ replayId, findingId, verdict,
 * patchedRevision }` accept shape — never a full row, never a promise.
 */
export async function requestE2Replay(
  baseUrl: string,
  findingId: string,
  request: unknown,
  idempotencyKey: string,
  fetchImpl: FetchImpl = fetch,
): Promise<
  | { status: "accepted"; replayId: string }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "unavailable"; detail: string }
> {
  const body = ReplayRequestSchema.parse(request);
  let response: Response;
  try {
    response = await fetchImpl(
      `${baseUrl}/api/v1/findings/${encodeURIComponent(findingId)}/replays`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    return {
      status: "unavailable",
      detail: error instanceof Error ? error.message : "network failure",
    };
  }
  if (!response.ok) return httpStatus(response);
  const envelope = envelopeData(await readJson(response));
  if (!envelope.present) return { status: "unavailable", detail: "contract validation failed" };
  const parsed = parseReplayAccept(envelope.data);
  if (parsed === null) return { status: "unavailable", detail: "contract validation failed" };
  return { status: "accepted", replayId: parsed.replayId };
}
