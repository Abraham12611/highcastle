import { getActiveScopeForTarget, getTarget, listEnvironments } from "@highcastle/db";
import { DbError } from "@highcastle/db";
import type { BffDeps } from "./deps";
import { authorizeProject, authorizeWorkspace, demoBinding } from "./authz";
import { mapEnvironment, mapProject, mapScope, mapTarget } from "./mappers";
import type { RouteResult } from "./scans";

/**
 * Read-only tenant navigation: session, workspaces, projects, targets and
 * the current authorization-scope summary. Guests see exactly the seeded
 * demo tenant; anything else reads as missing.
 */

export async function meFlow(deps: BffDeps): Promise<RouteResult> {
  const binding = demoBinding();
  const workspace = await authorizeWorkspace(
    deps.db,
    deps.session,
    binding.workspaceId,
  );
  const project = await authorizeProject(
    deps.db,
    deps.session,
    binding.workspaceId,
    binding.projectId,
  );
  return {
    status: 200,
    body: {
      data: {
        session:
          deps.session.kind === "guest"
            ? { kind: "guest", demo: true }
            : { kind: "user" },
        workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
        project: { id: project.id, slug: project.slug, name: project.name },
      },
    },
  };
}

export async function listWorkspacesFlow(deps: BffDeps): Promise<RouteResult> {
  const binding = demoBinding();
  const workspace = await authorizeWorkspace(
    deps.db,
    deps.session,
    binding.workspaceId,
  );
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
  const binding = demoBinding();
  if (input.workspaceId !== binding.workspaceId) {
    throw DbError.notFound("workspace", input.workspaceId);
  }
  const project = await authorizeProject(
    deps.db,
    deps.session,
    input.workspaceId,
    binding.projectId,
  );
  return {
    status: 200,
    body: {
      data: [
        {
          id: project.id,
          slug: project.slug,
          name: project.name,
          kind: project.kind,
          lifecycle: project.lifecycle,
        },
      ],
    },
  };
}

export async function getProjectFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  const binding = demoBinding();
  if (input.workspaceId !== binding.workspaceId) {
    throw DbError.notFound("workspace", input.workspaceId);
  }
  const project = await authorizeProject(
    deps.db,
    deps.session,
    input.workspaceId,
    input.projectId,
  );
  return { status: 200, body: { data: mapProject(project) } };
}

export async function listTargetsFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  // Single-target demo: the seeded lab target. A multi-target list awaits
  // an L02 listTargets repository; guests could not use it anyway.
  const binding = demoBinding();
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  if (
    input.workspaceId !== binding.workspaceId ||
    input.projectId !== binding.projectId
  ) {
    throw DbError.notFound("project", input.projectId);
  }
  const target = await getTarget(deps.db, input.workspaceId, binding.targetId);
  if (!target) throw DbError.notFound("target", binding.targetId);
  return { status: 200, body: { data: [mapTarget(target)] } };
}

export async function getCurrentScopeFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  const binding = demoBinding();
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  if (
    input.workspaceId !== binding.workspaceId ||
    input.projectId !== binding.projectId
  ) {
    throw DbError.notFound("project", input.projectId);
  }
  const scope = await getActiveScopeForTarget(
    deps.db,
    input.workspaceId,
    binding.targetId,
  );
  if (!scope || scope.projectId !== input.projectId) {
    throw DbError.notFound("authorization_scope", "current");
  }
  const environments = await listEnvironments(
    deps.db,
    input.workspaceId,
    input.projectId,
  );
  const permitted = environments.find(
    (env) => env.id === scope.permittedEnvironmentId,
  );
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
