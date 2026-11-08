/**
 * Demo handoff constants + typed request builders.
 *
 * Flow (aligned with L05/E3 auth and L18/E2 BFF contracts):
 *   1. POST /api/auth/demo → server-signed limited demo session (cookie)
 *      returns the authorized { workspaceId, projectId, targetAlias }.
 *   2. GET  /api/v1/projects/:projectId/assessment-context → the
 *      server-authorized environment, target and active scope IDs
 *      (L09's documented integration surface).
 *   3. POST /api/v1/projects/:projectId/scans with the strict
 *      CreateScanRequest body and Idempotency-Key in the header.
 *      Success envelope: { data: { scanId, status, eventsUrl, … } };
 *      failures: { error: { code, message }, requestId }.
 */

export const DEMO_SESSION_ENDPOINT = "/api/auth/demo";
export const DEMO_WORKSPACE_SLUG = "highcastle-demo";

export const assessmentContextEndpoint = (projectId: string) =>
  `/api/v1/projects/${projectId}/assessment-context`;

export const createScanEndpoint = (projectId: string) =>
  `/api/v1/projects/${projectId}/scans`;

export interface DemoSession {
  kind: string;
  userId: string;
  expiresAt: string;
  workspaceId: string;
  projectId: string;
  targetAlias: string;
}

/** L18 API returns { project, targets: [{target,environment,scope}] }. */
export interface AssessmentTarget {
  environment: { id: string; label: string; currentRevision: string };
  target: { id: string };
  scope: { id: string; allowedTestPackIds: string[] } | null;
}
export interface AssessmentContext {
  project: { id: string; name: string; slug: string };
  targets: AssessmentTarget[];
}
export type ApprovedAssessmentTarget = Omit<AssessmentTarget, "scope"> & {
  scope: NonNullable<AssessmentTarget["scope"]>;
};
/** Select an already-approved server-returned scope, never a user-supplied host. */
export function selectApprovedTarget(ctx: AssessmentContext): ApprovedAssessmentTarget | null {
  const target = ctx.targets.find(
    (option) => option.scope !== null && option.scope.allowedTestPackIds.includes("bola-invoice-v1"),
  );
  return target?.scope ? { target: target.target, environment: target.environment, scope: target.scope } : null;
}

export interface CreatedScan {
  scanId: string;
  eventsUrl: string;
}

/** Strict CreateScanRequestSchema fields — nothing else is sent. */
export function demoScanBody(ctx: ApprovedAssessmentTarget) {
  return {
    type: "targeted_red_team",
    environmentId: ctx.environment.id,
    targetId: ctx.target.id,
    authorizationScopeId: ctx.scope.id,
    testPackIds: ["bola-invoice-v1"],
  } as const;
}
