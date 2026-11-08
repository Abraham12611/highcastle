import { getActiveScopeForTarget, getTarget, listEnvironments, listProjects } from "@highcastle/db";
import { DbError } from "@highcastle/db";
import { listUserWorkspaces } from "./auth/membership";
import type { BffDeps } from "./deps";
import { authorizeProject, authorizeWorkspace, demoBinding } from "./authz";
import { mapEnvironment, mapProject, mapScope, mapTarget } from "./mappers";
import type { RouteResult } from "./scans";

/**
 * Read-only tenant navigation: session, workspaces, projects, targets,
 * authorization-scope summary, and the scan-wizard assessment context.
 *
 * Demo sessions resolve to their server-pinned workspace/project; anything
 * else reads as missing. Account sessions pass through real membership
 * checks; workspace listing stays unavailable until L02 provides a
 * user→workspaces lookup (fail closed, explicit).
 */

export async function meFlow(deps: BffDeps): Promise<RouteResult> {
  if (deps.session.kind === "demo") {
    const workspace = await authorizeWorkspace(deps.db, deps.session, deps.session.workspaceId);
    const project = await authorizeProject(
      deps.db,
      deps.session,
      deps.session.workspaceId,
      deps.session.projectId,
    );
    return {
      status: 200,
      body: {
        data: {
          session: { kind: "demo", userId: deps.session.userId },
          workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
          project: { id: project.id, slug: project.slug, name: project.name },
        },
      },
    };
  }
  return {
    status: 200,
    body: {
      data: {
        session: { kind: "account", userId: deps.session.userId },
        workspace: null,
        project: null,
      },
    },
  };
}

export async function listWorkspacesFlow(deps: BffDeps): Promise<RouteResult> {
  if (deps.session.kind === "account") {
    // Real workspace discovery for account sessions: every membership row
    // the internal user holds (provisioned on first sign-in; never the
    // seeded demo tenant).
    const memberships = await listUserWorkspaces(deps.db, deps.session.userId);
    return {
      status: 200,
      body: {
        data: memberships.map((m) => ({ id: m.id, slug: m.slug, name: m.name })),
      },
    };
  }
  if (deps.session.kind !== "demo") {
    throw new DbError(
      "unavailable",
      "account workspace listing requires a user-to-workspaces lookup that is not implemented yet",
    );
  }
  const workspace = await authorizeWorkspace(deps.db, deps.session, deps.session.workspaceId);
  return {
    status: 200,
    body: {
      data: [{ id: workspace.id, slug: workspace.slug, name: workspace.name }],
    },
  };
}

export async function listProjectsFlow(
  deps: BffDeps,
  input: { workspaceId: string },
): Promise<RouteResult> {
  await authorizeWorkspace(deps.db, deps.session, input.workspaceId);
  const projects = await listProjects(deps.db, input.workspaceId);
  return {
    status: 200,
    body: {
      data: projects.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
        kind: project.kind,
        lifecycle: project.lifecycle,
      })),
    },
  };
}

export async function getProjectFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  const project = await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  return { status: 200, body: { data: mapProject(project) } };
}

/**
 * Target discovery: the seeded demo workspace exposes its fixed lab target.
 * Other workspaces fail closed — target enumeration awaits an L02 listing
 * repository (no client-supplied hosts, ever).
 */
async function resolveLabTargetId(input: { workspaceId: string; projectId: string }) {
  const binding = demoBinding();
  if (input.workspaceId !== binding.workspaceId || input.projectId !== binding.projectId) {
    throw new DbError("unavailable", "target discovery for this workspace is not implemented yet");
  }
  return binding.targetId;
}

export async function listTargetsFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  const targetId = await resolveLabTargetId(input);
  const target = await getTarget(deps.db, input.workspaceId, targetId);
  if (!target) throw DbError.notFound("target", targetId);
  return { status: 200, body: { data: [mapTarget(target)] } };
}

export async function getCurrentScopeFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  const targetId = await resolveLabTargetId(input);
  const scope = await getActiveScopeForTarget(deps.db, input.workspaceId, targetId);
  if (!scope || scope.projectId !== input.projectId) {
    throw DbError.notFound("authorization_scope", "current");
  }
  const environments = await listEnvironments(deps.db, input.workspaceId, input.projectId);
  const permitted = environments.find((env) => env.id === scope.permittedEnvironmentId);
  return {
    status: 200,
    body: {
      data: {
        ...mapScope(scope),
        permittedEnvironment: permitted ? mapEnvironment(permitted) : null,
      },
    },
  };
}

/**
 * Scan-wizard assessment context: the project plus its authorized
 * target/environment/scope options. Shape matches the L09 wizard contract
 * (`features/scans/api.ts :: AssessmentContext`). Only pre-existing,
 * operator-approved rows are exposed — the client picks among approvals,
 * never free-form hosts.
 */
export async function getAssessmentContextFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  const project = await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  const targetId = await resolveLabTargetId(input);
  const [target, environments, scope] = await Promise.all([
    getTarget(deps.db, input.workspaceId, targetId),
    listEnvironments(deps.db, input.workspaceId, input.projectId),
    getActiveScopeForTarget(deps.db, input.workspaceId, targetId),
  ]);
  if (!target) throw DbError.notFound("target", targetId);
  const inScope =
    scope && scope.projectId === input.projectId
      ? {
          id: scope.id,
          allowedTestPackIds: [...scope.allowedTestPackIds],
          allowedMethods: [...scope.allowedMethods],
          allowedPaths: [...scope.allowedPaths],
          expiresAt:
            scope.expiresAt instanceof Date ? scope.expiresAt.toISOString() : scope.expiresAt,
          maxRequests: scope.maxRequests,
          maxDurationSeconds: scope.maxDurationSeconds,
        }
      : null;
  const permittedEnvId = scope?.permittedEnvironmentId;
  const targets = environments.map((environment) => ({
    target: {
      id: target.id,
      label: target.label,
      canonicalOrigin: target.canonicalOrigin,
      targetKind: target.targetKind,
      state: target.state,
    },
    environment: {
      id: environment.id,
      label: environment.label,
      currentRevision: environment.currentRevision,
    },
    scope: inScope && permittedEnvId === environment.id ? inScope : null,
  }));
  return {
    status: 200,
    body: {
      data: {
        project: { id: project.id, name: project.name, slug: project.slug },
        targets,
      },
    },
  };
}
