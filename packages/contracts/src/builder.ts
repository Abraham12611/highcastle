import { z } from "zod";
import { TargetStateSchema } from "./enums.js";
import { IsoUtcDateTimeSchema } from "./common.js";
import { ProjectIdSchema, TargetIdSchema } from "./ids.js";

/**
 * Builder (URL-only) onboarding contracts: owned-site verification,
 * explicit permitted-path consent, and strictly passive reconnaissance.
 *
 * Shared with E05 (contracts review), E06/E09 (UI + worker consumers).
 * Hard rule baked into the shapes: verification can prove site *control*;
 * it can never provide source access or auto-fix capability, so no field
 * claims either.
 */

// --- Site verification ---

export const SiteVerificationMethodSchema = z.enum(["dns-txt", "well-known"]);
export type SiteVerificationMethod = z.infer<typeof SiteVerificationMethodSchema>;

export const SiteVerificationStatusSchema = z.enum([
  "pending",
  "verified",
  "failed",
  "expired",
  "unreachable",
]);
export type SiteVerificationStatus = z.infer<typeof SiteVerificationStatusSchema>;

/** UI-facing target lifecycle for the builder path (derived, never raw DB). */
export const BuilderTargetStatusSchema = z.enum([
  "pending_verification",
  "verified",
  "permission_revoked",
  "unreachable",
]);
export type BuilderTargetStatus = z.infer<typeof BuilderTargetStatusSchema>;

// --- Requests ---

export const CreateBuilderProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    siteUrl: z
      .string()
      .min(4)
      .max(2048)
      .regex(/^https?:\/\//i, "siteUrl must start with http:// or https://"),
    description: z.string().max(2000).optional(),
  })
  .strict();
export type CreateBuilderProjectRequest = z.infer<typeof CreateBuilderProjectRequestSchema>;

export const VerifySiteRequestSchema = z
  .object({
    method: SiteVerificationMethodSchema,
  })
  .strict();
export type VerifySiteRequest = z.infer<typeof VerifySiteRequestSchema>;

/** A permitted public path prefix — must start with `/`, no credentials, no
 * absolute-URL smuggling, no `..`, max length bound. */
export const AllowedPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*$/,
    "paths must be absolute public URL paths (e.g. /login, /blog)",
  )
  .refine((p) => !p.includes("..") && !p.includes("//"), {
    message: "path must not contain .. or //",
  });

export const CONSENT_VERSION_V1 = "site-recon-consent-v1";

export const GrantSitePermissionRequestSchema = z
  .object({
    allowedPaths: z.array(AllowedPathSchema).min(1).max(50),
    consentAccepted: z.literal(true, {
      message: "explicit consent is required — cannot be implicit",
    }),
    consentVersion: z.literal(CONSENT_VERSION_V1),
  })
  .strict();
export type GrantSitePermissionRequest = z.infer<typeof GrantSitePermissionRequestSchema>;

// --- Responses ---

export const SiteVerificationIssueSchema = z.object({
  targetId: TargetIdSchema,
  status: SiteVerificationStatusSchema,
  expiresAt: IsoUtcDateTimeSchema,
  /** DNS instructions — record name + expected value. */
  dnsRecordName: z.string(),
  dnsTxtValue: z.string(),
  /** Well-known challenge — URL to serve + exact expected body. */
  wellKnownUrl: z.string(),
  wellKnownExpectedBody: z.string(),
});
export type SiteVerificationIssue = z.infer<typeof SiteVerificationIssueSchema>;

export const CreateBuilderProjectResponseSchema = z.object({
  projectId: ProjectIdSchema,
  targetId: TargetIdSchema,
  state: TargetStateSchema,
  verification: SiteVerificationIssueSchema,
  note: z.string(),
});
export type CreateBuilderProjectResponse = z.infer<typeof CreateBuilderProjectResponseSchema>;

export const VerifySiteResponseSchema = z.object({
  targetId: TargetIdSchema,
  status: SiteVerificationStatusSchema,
  state: TargetStateSchema,
  verifiedAt: IsoUtcDateTimeSchema.nullable(),
  /** User-safe failure detail — never leaks resolver internals. */
  reason: z.string().nullable(),
});
export type VerifySiteResponse = z.infer<typeof VerifySiteResponseSchema>;

export const SitePermissionSchema = z.object({
  id: z.string().uuid(),
  allowedPaths: z.array(z.string()),
  consentVersion: z.string(),
  grantedAt: IsoUtcDateTimeSchema,
  expiresAt: IsoUtcDateTimeSchema.nullable(),
  revokedAt: IsoUtcDateTimeSchema.nullable(),
  active: z.boolean(),
});
export type SitePermission = z.infer<typeof SitePermissionSchema>;

// --- Passive recon ---

export const PassiveObservationKindSchema = z.enum([
  "tls",
  "security_headers",
  "cookie",
  "http_status",
  "redirect",
  "dns",
  "metadata",
  "limitation",
]);
export type PassiveObservationKind = z.infer<typeof PassiveObservationKindSchema>;

export const PassiveObservationSchema = z.object({
  kind: PassiveObservationKindSchema,
  /** e.g. "strict-transport-security", "Set-Cookie: session", "GET /login". */
  name: z.string(),
  observed: z.boolean(),
  /** User-safe factual detail (e.g. "missing", "max-age=0", "TLSv1.3"). */
  detail: z.string().nullable(),
  severity: z.enum(["informational", "low", "medium", "high"]),
});
export type PassiveObservation = z.infer<typeof PassiveObservationSchema>;

export const PassiveReconStatusSchema = z.enum([
  "running",
  "completed",
  "partial",
  "failed",
  "quota_limited",
  "unreachable",
]);
export type PassiveReconStatus = z.infer<typeof PassiveReconStatusSchema>;

export const PassiveReconRunSchema = z.object({
  runId: z.string().uuid(),
  targetId: TargetIdSchema,
  status: PassiveReconStatusSchema,
  requestCount: z.number().int().nonnegative(),
  bytesReceived: z.number().int().nonnegative(),
  startedAt: IsoUtcDateTimeSchema,
  completedAt: IsoUtcDateTimeSchema.nullable(),
  observations: z.array(PassiveObservationSchema),
  /** Always-present honesty statements: what this run could NOT establish. */
  limitations: z.array(z.string()),
  errorCode: z.string().nullable(),
});
export type PassiveReconRun = z.infer<typeof PassiveReconRunSchema>;

export const BuilderTargetStatusResponseSchema = z.object({
  targetId: TargetIdSchema,
  state: TargetStateSchema,
  builderStatus: BuilderTargetStatusSchema,
  canonicalOrigin: z.string(),
  verification: z.object({
    status: SiteVerificationStatusSchema,
    method: SiteVerificationMethodSchema.nullable(),
    expiresAt: IsoUtcDateTimeSchema.nullable(),
    verifiedAt: IsoUtcDateTimeSchema.nullable(),
    dnsRecordName: z.string(),
    dnsTxtValue: z.string(),
    wellKnownUrl: z.string(),
    wellKnownExpectedBody: z.string(),
  }),
  permission: SitePermissionSchema.nullable(),
  lastRecon: PassiveReconRunSchema.nullable(),
});
export type BuilderTargetStatusResponse = z.infer<typeof BuilderTargetStatusResponseSchema>;
