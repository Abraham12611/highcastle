import {
  PreflightRequestSchema,
  PreflightResponseSchema,
} from "@highcastle/contracts";
import { DbError, listScans } from "@highcastle/db";
import { checkScopeRelations, checkScopeStatus } from "@highcastle/security";
import { isKnownPackId } from "@highcastle/security";
import type { BffDeps } from "./deps";
import { requestTime } from "./deps";
import {
  authorizeProject,
  authorizeWorkspaceMutation,
  loadExecutionScope,
} from "./authz";
import { mapEnvironment, mapProject, mapScope, mapTarget } from "./mappers";
import type { RouteResult } from "./scans";

/**
 * Preflight: validate the exact synthetic lab binding, scope, version and
 * quota WITHOUT executing anything. A failing check blocks scan creation
 * with the same reason; preflight itself never enqueues or runs.
 */

const MAX_ACTIVE_SCANS_PER_PROJECT = 5;

export async function preflightFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string; body: unknown },
): Promise<RouteResult> {
  const parsed = PreflightRequestSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new DbError("validation_error", "invalid preflight request");
  }
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  await authorizeWorkspaceMutation(deps.db, deps.session, input.workspaceId, "run-preflight");
  const now = requestTime(deps);
  const checks: { name: string; passed: boolean; detail?: string }[] = [];

  // Binding failures fail closed: unknown IDs read as 404, a scope that does
  // not cover this project/target/environment reads as 403. Either way no
  // check runs without a resolved, authorized binding.
  const loaded = await loadExecutionScope(
    deps.db,
    input.workspaceId,
    input.projectId,
    parsed.data.targetId,
    parsed.data.environmentId,
    parsed.data.authorizationScopeId,
  );
  checks.push({ name: "scope_binding", passed: true });
  const projectRow = await authorizeProject(
    deps.db,
    deps.session,
    input.workspaceId,
    input.projectId,
  );
  const scope = mapScope(loaded.scope);
  const target = mapTarget(loaded.target);
  const environment = mapEnvironment(loaded.environment);
  const project = mapProject(projectRow);

  const toDetail = (
    reasons: { code: string; detail: string }[],
  ): { passed: boolean; detail?: string } =>
    reasons.length === 0
      ? { passed: true }
      : {
          passed: false,
          detail: reasons.map((reason) => reason.detail).join("; "),
        };
  checks.push({
    name: "scope_active",
    ...toDetail(checkScopeStatus(scope, now)),
  });
  checks.push({
    name: "scope_relations",
    ...toDetail(checkScopeRelations(scope, { project, target, environment }, now)),
  });
  const packOk = isKnownPackId("bola-invoice-v1");
  checks.push({
    name: "target_healthy",
    ...(environment.provisionStatus === "ready" && packOk
      ? { passed: true }
      : {
          passed: false,
          detail: `environment is ${environment.provisionStatus}`,
        }),
  });

  const recent = await listScans(deps.db, input.workspaceId, {
    projectId: input.projectId,
    limit: 100,
  });
  const active = recent.filter(
    (scan) => !["completed", "partial", "failed", "canceled"].includes(scan.status),
  ).length;
  checks.push({
    name: "quota_available",
    ...(active < MAX_ACTIVE_SCANS_PER_PROJECT
      ? { passed: true }
      : {
          passed: false,
          detail: `${active} active scans (max ${MAX_ACTIVE_SCANS_PER_PROJECT})`,
        }),
  });

  const ok = checks.every((check) => check.passed);
  // scopeHash/targetRevision are factual stored values, reported whenever the
  // binding itself resolved — even when a check fails.
  const response = PreflightResponseSchema.parse({
    ok,
    checks,
    scopeHash: scope.scopeHash,
    targetRevision: environment.currentRevision,
  });
  return { status: 200, body: { data: response } };
}
