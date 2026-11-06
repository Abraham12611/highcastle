import { z } from "zod";
import {
  ScopeStatusSchema,
  TestPackIdSchema,
  TestPackMethodSchema,
} from "./enums.js";
import {
  AuthorizationScopeIdSchema,
  EnvironmentIdSchema,
  ProjectIdSchema,
  TargetIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { IsoUtcDateTimeSchema, ScopeHashSchema } from "./common.js";

/**
 * Authorization scopes — the signed, immutable execution boundary.
 *
 * Produced by the scope-approval flow, hashed by L04 (`scopeHash`), snapshotted
 * onto every scan/attempt, and intersected by the policy gateway (L13) before
 * any runner exists. An expired/revoked scope, or no scope at all, is a deny.
 * Consumed by L02 (tables), L04 (hash + intersection), L13/L18 (validation).
 */

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;

const HostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(HOSTNAME_RE, "Must be a bare hostname, not a URL");

const ScopedPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^\//, "Scope paths must be absolute");

/** H demo hard caps — the contract rejects anything above these outright. */
export const SCOPE_HARD_CAPS = {
  maxDurationSeconds: 600,
  maxRequests: 100,
  maxConcurrency: 4,
  maxMemoryMb: 1024,
} as const;

export const CreateAuthorizationScopeRequestSchema = z
  .object({
    projectId: ProjectIdSchema,
    targetId: TargetIdSchema,
    permittedEnvironmentId: EnvironmentIdSchema,
    allowedHosts: z.array(HostnameSchema).min(1).max(16),
    allowedPaths: z.array(ScopedPathSchema).min(1).max(64),
    deniedPaths: z.array(ScopedPathSchema).max(64).default([]),
    allowedTestPackIds: z.array(TestPackIdSchema).min(1).max(8),
    allowedMethods: z.array(TestPackMethodSchema).min(1).max(4),
    maxDurationSeconds: z
      .number()
      .int()
      .min(1)
      .max(SCOPE_HARD_CAPS.maxDurationSeconds),
    maxRequests: z
      .number()
      .int()
      .min(1)
      .max(SCOPE_HARD_CAPS.maxRequests),
    maxConcurrency: z
      .number()
      .int()
      .min(1)
      .max(SCOPE_HARD_CAPS.maxConcurrency),
    maxMemoryMb: z
      .number()
      .int()
      .min(64)
      .max(SCOPE_HARD_CAPS.maxMemoryMb),
    expiresAt: IsoUtcDateTimeSchema,
  })
  .strict();
export type CreateAuthorizationScopeRequest = z.infer<
  typeof CreateAuthorizationScopeRequestSchema
>;

export const AuthorizationScopeSchema = z
  .object({
    id: AuthorizationScopeIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    targetId: TargetIdSchema,
    version: z.number().int().min(1),
    actorUserId: UserIdSchema,
    status: ScopeStatusSchema,
    allowedHosts: z.array(HostnameSchema).min(1).max(16),
    allowedPaths: z.array(ScopedPathSchema).min(1).max(64),
    deniedPaths: z.array(ScopedPathSchema).max(64),
    allowedTestPackIds: z.array(TestPackIdSchema).min(1).max(8),
    allowedMethods: z.array(TestPackMethodSchema).min(1).max(4),
    maxDurationSeconds: z.number().int().min(1),
    maxRequests: z.number().int().min(1),
    maxConcurrency: z.number().int().min(1),
    maxMemoryMb: z.number().int().min(1),
    networkProfileId: z.string().min(1).max(128).nullable(),
    permittedEnvironmentId: EnvironmentIdSchema,
    approvedAt: IsoUtcDateTimeSchema,
    expiresAt: IsoUtcDateTimeSchema,
    scopeHash: ScopeHashSchema,
  })
  .strict();
export type AuthorizationScope = z.infer<typeof AuthorizationScopeSchema>;

// --- Preflight (checks without running an attack) ---

export const PreflightCheckSchema = z
  .object({
    name: z.string().min(1).max(128),
    passed: z.boolean(),
    detail: z.string().max(500).optional(),
  })
  .strict();
export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

export const PreflightRequestSchema = z
  .object({
    targetId: TargetIdSchema,
    environmentId: EnvironmentIdSchema,
    authorizationScopeId: AuthorizationScopeIdSchema,
  })
  .strict();
export type PreflightRequest = z.infer<typeof PreflightRequestSchema>;

export const PreflightResponseSchema = z
  .object({
    ok: z.boolean(),
    checks: z.array(PreflightCheckSchema).min(1),
    scopeHash: ScopeHashSchema,
    targetRevision: z.string().min(1).max(128),
  })
  .strict();
export type PreflightResponse = z.infer<typeof PreflightResponseSchema>;
