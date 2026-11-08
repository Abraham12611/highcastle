import { z } from "zod";

/**
 * Domain identifiers.
 *
 * Every ID is a UUID v4 string on the wire (ADR-005: UUID primary keys, string
 * in API). Each ID is a branded Zod type so a scan ID can never be passed
 * where a finding ID is expected — tenant/project/scan relation checks in
 * L02/L18 join on these, and the brand makes mix-ups a compile error.
 */

function uuidBrand<const T extends string>() {
  return z.string().uuid().brand<T>();
}

export const WorkspaceIdSchema = uuidBrand<"WorkspaceId">();
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;

export const UserIdSchema = uuidBrand<"UserId">();
export type UserId = z.infer<typeof UserIdSchema>;

export const ProjectIdSchema = uuidBrand<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const ProjectSourceIdSchema = uuidBrand<"ProjectSourceId">();
export type ProjectSourceId = z.infer<typeof ProjectSourceIdSchema>;

export const TargetIdSchema = uuidBrand<"TargetId">();
export type TargetId = z.infer<typeof TargetIdSchema>;

export const EnvironmentIdSchema = uuidBrand<"EnvironmentId">();
export type EnvironmentId = z.infer<typeof EnvironmentIdSchema>;

export const TestIdentityIdSchema = uuidBrand<"TestIdentityId">();
export type TestIdentityId = z.infer<typeof TestIdentityIdSchema>;

export const AuthorizationScopeIdSchema =
  uuidBrand<"AuthorizationScopeId">();
export type AuthorizationScopeId = z.infer<typeof AuthorizationScopeIdSchema>;

export const TestApprovalIdSchema = uuidBrand<"TestApprovalId">();
export type TestApprovalId = z.infer<typeof TestApprovalIdSchema>;

export const ScanIdSchema = uuidBrand<"ScanId">();
export type ScanId = z.infer<typeof ScanIdSchema>;

export const ScanEventIdSchema = uuidBrand<"ScanEventId">();
export type ScanEventId = z.infer<typeof ScanEventIdSchema>;

export const ProposalIdSchema = uuidBrand<"ProposalId">();
export type ProposalId = z.infer<typeof ProposalIdSchema>;

export const ModelCallIdSchema = uuidBrand<"ModelCallId">();
export type ModelCallId = z.infer<typeof ModelCallIdSchema>;

export const AttemptIdSchema = uuidBrand<"AttemptId">();
export type AttemptId = z.infer<typeof AttemptIdSchema>;

export const EvidenceArtifactIdSchema = uuidBrand<"EvidenceArtifactId">();
export type EvidenceArtifactId = z.infer<typeof EvidenceArtifactIdSchema>;

export const ContainmentEventIdSchema = uuidBrand<"ContainmentEventId">();
export type ContainmentEventId = z.infer<typeof ContainmentEventIdSchema>;

export const RunnerInstanceIdSchema = uuidBrand<"RunnerInstanceId">();
export type RunnerInstanceId = z.infer<typeof RunnerInstanceIdSchema>;

export const FindingIdSchema = uuidBrand<"FindingId">();
export type FindingId = z.infer<typeof FindingIdSchema>;

export const FindingOccurrenceIdSchema = uuidBrand<"FindingOccurrenceId">();
export type FindingOccurrenceId = z.infer<typeof FindingOccurrenceIdSchema>;

export const FindingHistoryIdSchema = uuidBrand<"FindingHistoryId">();
export type FindingHistoryId = z.infer<typeof FindingHistoryIdSchema>;

export const RemediationIdSchema = uuidBrand<"RemediationId">();
export type RemediationId = z.infer<typeof RemediationIdSchema>;

export const ReplayIdSchema = uuidBrand<"ReplayId">();
export type ReplayId = z.infer<typeof ReplayIdSchema>;

export const AuditEventIdSchema = uuidBrand<"AuditEventId">();
export type AuditEventId = z.infer<typeof AuditEventIdSchema>;
