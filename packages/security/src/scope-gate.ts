import type { AuthorizationScope, Environment, Project, Target } from "@highcastle/contracts";
import { denyReason, type PolicyDenyReason } from "./decisions.js";

/**
 * Scope validity and authorization-relation checks.
 *
 * These functions are the deterministic gate between a *signed, approved*
 * scope and any action: status/expiry first, then the workspace → project →
 * target → environment chain the approval actually covers. Every comparison
 * is exact ID equality on verified (schema-parsed) objects — a scope that
 * names another workspace's project or an unverified target denies.
 */

export function checkScopeStatus(
  scope: Pick<AuthorizationScope, "status" | "approvedAt" | "expiresAt">,
  now: Date,
): PolicyDenyReason[] {
  const reasons: PolicyDenyReason[] = [];

  if (scope.status === "revoked") {
    reasons.push(denyReason("scope_revoked", "authorization scope was revoked"));
  }
  if (scope.status === "expired") {
    reasons.push(denyReason("scope_expired", "authorization scope is marked expired"));
  }

  const expiresAt = Date.parse(scope.expiresAt);
  if (Number.isNaN(expiresAt) || expiresAt <= now.getTime()) {
    reasons.push(denyReason("scope_expired", `authorization scope expired at ${scope.expiresAt}`));
  }

  const approvedAt = Date.parse(scope.approvedAt);
  if (Number.isNaN(approvedAt) || approvedAt > now.getTime()) {
    reasons.push(
      denyReason(
        "scope_not_yet_valid",
        `authorization scope approval timestamp ${scope.approvedAt} is in the future`,
      ),
    );
  }

  return reasons;
}

export interface ScopeRelationObjects {
  project: Pick<Project, "id" | "workspaceId" | "lifecycle">;
  target: Pick<
    Target,
    "id" | "workspaceId" | "projectId" | "environmentId" | "state" | "verificationExpiresAt"
  >;
  environment: Pick<Environment, "id" | "workspaceId" | "projectId" | "provisionStatus">;
}

export function checkScopeRelations(
  scope: Pick<
    AuthorizationScope,
    "workspaceId" | "projectId" | "targetId" | "permittedEnvironmentId"
  >,
  objects: ScopeRelationObjects,
  now: Date,
): PolicyDenyReason[] {
  const reasons: PolicyDenyReason[] = [];
  const { project, target, environment } = objects;

  // --- Workspace isolation: every object must belong to the scope tenant ---
  if (
    scope.workspaceId !== project.workspaceId ||
    scope.workspaceId !== target.workspaceId ||
    scope.workspaceId !== environment.workspaceId
  ) {
    reasons.push(
      denyReason(
        "workspace_mismatch",
        "scope, project, target and environment do not share one workspace",
      ),
    );
  }

  // --- Project relation ---
  if (
    scope.projectId !== project.id ||
    target.projectId !== project.id ||
    environment.projectId !== project.id
  ) {
    reasons.push(
      denyReason(
        "project_mismatch",
        "scope project does not match the supplied project/target/environment",
      ),
    );
  }
  if (project.lifecycle === "archived" || project.lifecycle === "paused") {
    reasons.push(
      denyReason(
        "project_not_active",
        `project lifecycle ${project.lifecycle} does not permit execution`,
      ),
    );
  }

  // --- Target relation and verification state ---
  if (scope.targetId !== target.id) {
    reasons.push(denyReason("target_mismatch", "scope target does not match the supplied target"));
  }
  if (target.state !== "verified") {
    reasons.push(denyReason("target_not_verified", `target state ${target.state} is not verified`));
  } else if (
    target.verificationExpiresAt !== null &&
    Date.parse(target.verificationExpiresAt) <= now.getTime()
  ) {
    reasons.push(denyReason("target_not_verified", "target verification has expired"));
  }

  // --- Environment relation and readiness ---
  if (scope.permittedEnvironmentId !== environment.id || target.environmentId !== environment.id) {
    reasons.push(
      denyReason(
        "environment_mismatch",
        "scope environment does not match the supplied target/environment",
      ),
    );
  }
  if (environment.provisionStatus !== "ready") {
    reasons.push(
      denyReason(
        "environment_not_ready",
        `environment provision status ${environment.provisionStatus} is not ready`,
      ),
    );
  }

  return reasons;
}
