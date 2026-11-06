import { z } from "zod";
import {
  EnvironmentKindSchema,
  ProjectKindSchema,
  ProjectLifecycleSchema,
  ProvisionStatusSchema,
  TargetKindSchema,
  TargetStateSchema,
  TargetVerificationMethodSchema,
  TestIdentityRoleSchema,
} from "./enums.js";
import {
  EnvironmentIdSchema,
  ProjectIdSchema,
  TargetIdSchema,
  TestIdentityIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import {
  IsoUtcDateTimeSchema,
  ProjectSlugSchema,
  SemVerSchema,
} from "./common.js";

/**
 * Projects, targets, environments and synthetic test identities.
 * Consumed by L02 (Drizzle tables), L18 (BFF routes), L08/L09 (dashboards).
 */

// --- Projects ---

export const CreateProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: ProjectSlugSchema.optional(),
    description: z.string().max(2000).optional(),
    kind: ProjectKindSchema.default("demo"),
  })
  .strict();
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    lifecycle: ProjectLifecycleSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be updated",
  });
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const ProjectSchema = z
  .object({
    id: ProjectIdSchema,
    workspaceId: WorkspaceIdSchema,
    slug: ProjectSlugSchema,
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullable(),
    kind: ProjectKindSchema,
    lifecycle: ProjectLifecycleSchema,
    createdBy: UserIdSchema,
    createdAt: IsoUtcDateTimeSchema,
    updatedAt: IsoUtcDateTimeSchema,
    archivedAt: IsoUtcDateTimeSchema.nullable(),
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

// --- Targets ---

const HttpsOriginSchema = z
  .string()
  .url()
  .max(2048)
  .refine((v) => v.startsWith("https://"), {
    message: "Target origin must use https",
  });

export const CreateTargetRequestSchema = z
  .object({
    label: z.string().min(1).max(120),
    canonicalOrigin: HttpsOriginSchema,
    targetKind: TargetKindSchema,
    environmentId: EnvironmentIdSchema.optional(),
  })
  .strict();
export type CreateTargetRequest = z.infer<typeof CreateTargetRequestSchema>;

export const TargetSchema = z
  .object({
    id: TargetIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    environmentId: EnvironmentIdSchema.nullable(),
    label: z.string().min(1).max(120),
    canonicalOrigin: HttpsOriginSchema,
    targetKind: TargetKindSchema,
    state: TargetStateSchema,
    verificationStatus: z.string().min(1).max(64).nullable(),
    verificationMethod: TargetVerificationMethodSchema.nullable(),
    verifiedBy: UserIdSchema.nullable(),
    verifiedAt: IsoUtcDateTimeSchema.nullable(),
    verificationExpiresAt: IsoUtcDateTimeSchema.nullable(),
  })
  .strict();
export type Target = z.infer<typeof TargetSchema>;

// --- Environments ---

export const CreateEnvironmentRequestSchema = z
  .object({
    label: z.string().min(1).max(120),
    kind: EnvironmentKindSchema,
    currentRevision: z.string().min(1).max(128),
    fixtureVersion: SemVerSchema,
  })
  .strict();
export type CreateEnvironmentRequest = z.infer<
  typeof CreateEnvironmentRequestSchema
>;

export const EnvironmentSchema = z
  .object({
    id: EnvironmentIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    label: z.string().min(1).max(120),
    kind: EnvironmentKindSchema,
    currentRevision: z.string().min(1).max(128),
    fixtureVersion: SemVerSchema,
    provisionStatus: ProvisionStatusSchema,
    networkProfileId: z.string().min(1).max(128).nullable(),
    createdAt: IsoUtcDateTimeSchema,
    destroyedAt: IsoUtcDateTimeSchema.nullable(),
  })
  .strict();
export type Environment = z.infer<typeof EnvironmentSchema>;

// --- Synthetic test identities (Alice / Bob fixtures) ---

export const TestIdentitySchema = z
  .object({
    id: TestIdentityIdSchema,
    workspaceId: WorkspaceIdSchema,
    environmentId: EnvironmentIdSchema,
    label: z.string().min(1).max(64),
    role: TestIdentityRoleSchema,
    /** Always true: H runs only against synthetic fixture accounts. */
    synthetic: z.literal(true),
    /** Fixture subject (e.g. `user_A`); the credential itself is a
     * server-side secret reference, never part of this contract. */
    fixtureSubjectId: z.string().min(1).max(128),
    active: z.boolean(),
  })
  .strict();
export type TestIdentity = z.infer<typeof TestIdentitySchema>;
