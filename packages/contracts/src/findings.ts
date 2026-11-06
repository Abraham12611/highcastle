import { z } from "zod";
import {
  ActorTypeSchema,
  ConfidenceSchema,
  EvidenceArtifactKindSchema,
  EvidenceStorageKindSchema,
  FindingCategorySchema,
  OracleVerdictSchema,
  RemediationRecordStatusSchema,
  RemediationStatusSchema,
  SeveritySchema,
  TriageTargetStatusSchema,
} from "./enums.js";
import {
  AttemptIdSchema,
  EvidenceArtifactIdSchema,
  FindingHistoryIdSchema,
  FindingIdSchema,
  FindingOccurrenceIdSchema,
  ProjectIdSchema,
  RemediationIdSchema,
  ScanIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { IsoUtcDateTimeSchema, Sha256HexSchema } from "./common.js";

/**
 * Findings, evidence, severity/confidence/remediation axes and fix guidance.
 *
 * Three independent axes (04_RELATIONSHIPS_AND_STATES):
 * - severity: risk impact (reviewable, set by agent + human triage)
 * - confidence: evidentiary strength (`confirmed_by_execution` ONLY from the
 *   independent oracle over recorded runner output — never from model prose)
 * - remediation status: fix workflow position (`verified_fixed` ONLY from a
 *   replay where the baseline passes AND the cross-account read is denied)
 *
 * Consumers: L15 (oracle verdicts), L16 (finding upsert), L18 (BFF + triage),
 * L10 (finding/fix/replay UI).
 */

// --- Findings ---

/** Stable dedup key, e.g. `bola:invoice_lookup:owner_check`. */
export const FindingFingerprintSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9:_-]*[a-z0-9]$/);
export type FindingFingerprint = z.infer<typeof FindingFingerprintSchema>;

export const FindingSchema = z
  .object({
    id: FindingIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    stableFingerprint: FindingFingerprintSchema,
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(2000),
    category: FindingCategorySchema,
    severity: SeveritySchema,
    confidence: ConfidenceSchema,
    remediationStatus: RemediationStatusSchema,
    firstSeenAt: IsoUtcDateTimeSchema,
    lastSeenAt: IsoUtcDateTimeSchema,
    latestConfirmedAttemptId: AttemptIdSchema.nullable(),
    ownerUserId: UserIdSchema.nullable(),
    createdAt: IsoUtcDateTimeSchema,
    updatedAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type Finding = z.infer<typeof FindingSchema>;

export const FindingOccurrenceSchema = z
  .object({
    id: FindingOccurrenceIdSchema,
    workspaceId: WorkspaceIdSchema,
    findingId: FindingIdSchema,
    scanId: ScanIdSchema,
    attemptId: AttemptIdSchema.nullable(),
    sourceRevision: z.string().min(1).max(128).nullable(),
    targetRevision: z.string().min(1).max(128),
    evidenceConfidence: ConfidenceSchema,
    observedAt: IsoUtcDateTimeSchema,
    oracleVerdict: OracleVerdictSchema,
  })
  .strict();
export type FindingOccurrence = z.infer<typeof FindingOccurrenceSchema>;

export const FindingHistorySchema = z
  .object({
    id: FindingHistoryIdSchema,
    workspaceId: WorkspaceIdSchema,
    findingId: FindingIdSchema,
    fromStatus: RemediationStatusSchema,
    toStatus: RemediationStatusSchema,
    actorType: ActorTypeSchema,
    actorId: UserIdSchema.nullable(),
    reason: z.string().min(1).max(500),
    createdAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type FindingHistory = z.infer<typeof FindingHistorySchema>;

// --- Evidence artifacts ---

export const EvidenceArtifactSchema = z
  .object({
    id: EvidenceArtifactIdSchema,
    workspaceId: WorkspaceIdSchema,
    scanId: ScanIdSchema,
    attemptId: AttemptIdSchema.nullable(),
    artifactKind: EvidenceArtifactKindSchema,
    storageKind: EvidenceStorageKindSchema,
    /**
     * Unguessable object key. Never exposed to the browser — L18 serves
     * redacted bytes or a short-lived signed URL after scoped auth.
     */
    storageKey: z.string().min(16).max(512),
    sha256: Sha256HexSchema,
    byteSize: z.number().int().min(0).max(50_000_000),
    contentType: z.string().min(1).max(128),
    /** Stored artifacts are ALWAYS redacted. Raw output is transient only. */
    redacted: z.literal(true),
    retentionUntil: IsoUtcDateTimeSchema.nullable(),
    createdAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>;

// --- Remediation records + fix guidance ---

export const RemediationSchema = z
  .object({
    id: RemediationIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    findingId: FindingIdSchema,
    sourceCommitBefore: z.string().min(1).max(128),
    sourceCommitAfter: z.string().min(1).max(128).nullable(),
    summary: z.string().min(1).max(2000),
    fixPromptRedacted: z.string().max(8000).nullable(),
    requiredInvariants: z.array(z.string().min(1).max(500)).min(1).max(16),
    status: RemediationRecordStatusSchema,
    createdAt: IsoUtcDateTimeSchema,
    updatedAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type Remediation = z.infer<typeof RemediationSchema>;

/** POST /findings/:fid/fix-prompt response data (nonsecret guidance only). */
export const FixPromptResponseSchema = z
  .object({
    findingId: FindingIdSchema,
    rootCause: z.string().min(1).max(2000),
    smallestFix: z.string().min(1).max(4000),
    requiredInvariants: z.array(z.string().min(1).max(500)).min(1).max(16),
    testGuidance: z.string().min(1).max(2000),
  })
  .strict();
export type FixPromptResponse = z.infer<typeof FixPromptResponseSchema>;

// --- Triage (human review; cannot award verified_fixed) ---

export const TriageFindingRequestSchema = z
  .object({
    toStatus: TriageTargetStatusSchema,
    reason: z.string().min(1).max(500),
    ownerUserId: UserIdSchema.optional(),
  })
  .strict();
export type TriageFindingRequest = z.infer<typeof TriageFindingRequestSchema>;
