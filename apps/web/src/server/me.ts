import { z } from "zod";
import { CreateProjectRequestSchema, ExperienceModeSchema } from "@highcastle/contracts";
import {
  createProject,
  createWorkspace,
  ensureAccountWorkspace,
  getActiveScopeForTarget,
  getTarget,
  getUserPreferences,
  getWorkspaceMember,
  listEnvironments,
  listProjects,
  listTargets,
  setExperienceMode,
} from "@highcastle/db";
import { DbError } from "@highcastle/db";
import type { BffDeps } from "./deps";
import { authorizeProject, authorizeWorkspace, demoBinding } from "./authz";
import { mapEnvironment, mapProject, mapScope, mapTarget } from "./mappers";
import type { RouteResult } from "./scans";

/**
 * Tenant navigation + account tenancy (issue #72 / E12).
 *
 * Demo sessions resolve to their server-pinned workspace/project; anything
 * else reads as missing. Account sessions resolve through real
 * `workspace_members` rows — `ensureAccountWorkspace` lazily provisions the
 * first workspace inside its idempotent transaction so a brand-new Clerk
 * user reaches a functional dashboard on first request (first login), and
 * every later login returns the same rows (repeated login). A revoked
 * membership never re-provisions (tombstone by derived slug).
 */

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value;

interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  role: string;
  joinedAt: string | null;
}

function mapWorkspaceSummary(row: {
  id: string;
  slug: string;
  name: string;
  status: string;
  role: string;
  joinedAt: Date | string | null;
}): WorkspaceSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    role: row.role,
    joinedAt: iso(row.joinedAt),
  };
}

/**
 * Account-only tenant bootstrap: runs the idempotent provisioning
 * transaction and returns the authoritative membership list. The write is
 * self-scoped to the caller's own identity and replay-safe — deliberately
 * invoked from the read endpoints (`/api/v1/me`, `/api/v1/workspaces`) so a
 * first Clerk sign-in yields a real tenant without any extra client call.
 */
async function ensureAccountTenancy(
  deps: BffDeps & { session: { kind: "account"; userId: string } },
) {
  const { memberships } = await ensureAccountWorkspace(deps.db, {
    userId: deps.session.userId,
  });
  return memberships;
}

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
  const memberships = await ensureAccountTenancy({
    ...deps,
    session: deps.session,
  });
  const preferences = await getUserPreferences(deps.db, deps.session.userId);
  const workspaces = memberships.map((membership) =>
    mapWorkspaceSummary({
      id: membership.workspace.id,
      slug: membership.workspace.slug,
      name: membership.workspace.name,
      status: membership.workspace.status,
      role: membership.role,
      joinedAt: membership.joinedAt,
    }),
  );
  return {
    status: 200,
    body: {
      data: {
        session: { kind: "account", userId: deps.session.userId },
        user: { id: deps.session.userId },
        preferences: { experienceMode: preferences?.experienceMode ?? "builder" },
        workspace: workspaces[0] ?? null,
        project: null,
        workspaces,
      },
    },
  };
}

export async function listWorkspacesFlow(deps: BffDeps): Promise<RouteResult> {
  if (deps.session.kind === "demo") {
    const workspace = await authorizeWorkspace(deps.db, deps.session, deps.session.workspaceId);
    return {
      status: 200,
      body: {
        data: [{ id: workspace.id, slug: workspace.slug, name: workspace.name }],
      },
    };
  }
  const memberships = await ensureAccountTenancy({
    ...deps,
    session: deps.session,
  });
  return {
    status: 200,
    body: {
      data: memberships.map((membership) =>
        mapWorkspaceSummary({
          id: membership.workspace.id,
          slug: membership.workspace.slug,
          name: membership.workspace.name,
          status: membership.workspace.status,
          role: membership.role,
          joinedAt: membership.joinedAt,
        }),
      ),
    },
  };
}

const UpdatePreferencesBodySchema = z.object({ experienceMode: ExperienceModeSchema }).strict();

/** PATCH /api/v1/me/preferences — persists the account experience mode. */
export async function updatePreferencesFlow(
  deps: BffDeps,
  input: { body: unknown },
): Promise<RouteResult> {
  if (deps.session.kind === "demo") {
    throw new DbError("forbidden", "demo sessions have no persisted preferences");
  }
  const parsed = UpdatePreferencesBodySchema.safeParse(input.body);
  if (!parsed.success) {
    throw new DbError("validation_error", "invalid preferences request");
  }
  const row = await setExperienceMode(deps.db, deps.session.userId, parsed.data.experienceMode);
  return {
    status: 200,
    body: { data: { experienceMode: row.experienceMode } },
  };
}

const WorkspaceSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

const CreateWorkspaceBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: WorkspaceSlugSchema.optional(),
  })
  .strict();

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : `w-${crypto.randomUUID().slice(0, 8)}`;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** POST /api/v1/workspaces — explicit workspace creation; caller becomes owner. */
export async function createWorkspaceFlow(
  deps: BffDeps,
  input: { body: unknown },
): Promise<RouteResult> {
  if (deps.session.kind === "demo") {
    throw new DbError("forbidden", "demo sessions cannot create workspaces");
  }
  const parsed = CreateWorkspaceBodySchema.safeParse(input.body);
  if (!parsed.success) {
    throw new DbError("validation_error", "invalid workspace request");
  }
  const slug = parsed.data.slug ?? slugify(parsed.data.name);
  let workspace;
  try {
    workspace = await createWorkspace(deps.db, {
      slug,
      name: parsed.data.name,
      ownerUserId: deps.session.userId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw DbError.conflict("workspace slug already exists", { slug });
    }
    throw error;
  }
  return {
    status: 201,
    body: {
      data: mapWorkspaceSummary({
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        status: workspace.status,
        role: "owner",
        joinedAt: workspace.createdAt,
      }),
    },
  };
}

/** POST /api/v1/workspaces/:wid/projects — create a draft project (owner/admin). */
export async function createProjectFlow(
  deps: BffDeps,
  input: { workspaceId: string; body: unknown },
): Promise<RouteResult> {
  if (deps.session.kind === "demo") {
    throw new DbError("forbidden", "demo sessions cannot create projects");
  }
  await authorizeWorkspace(deps.db, deps.session, input.workspaceId);
  const member = await getWorkspaceMember(deps.db, input.workspaceId, deps.session.userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new DbError("forbidden", "project creation requires owner or admin role");
  }
  const parsed = CreateProjectRequestSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new DbError("validation_error", "invalid project request");
  }
  const slug = parsed.data.slug ?? slugify(parsed.data.name);
  let project;
  try {
    project = await createProject(deps.db, {
      workspaceId: input.workspaceId,
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      kind: parsed.data.kind,
      createdBy: deps.session.userId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw DbError.conflict("project slug already exists in this workspace", { slug });
    }
    throw error;
  }
  return { status: 201, body: { data: mapProject(project) } };
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
 * Targets visible to this session for the project. Demo stays pinned to the
 * fixed lab target; accounts list the project's real registered targets
 * (never client-supplied hosts — targets only ever enter via operator or
 * verified-ownership provisioning lanes).
 */
async function targetsForProject(deps: BffDeps, input: { workspaceId: string; projectId: string }) {
  if (deps.session.kind === "demo") {
    const target = await getTarget(deps.db, input.workspaceId, demoBinding().targetId);
    return target ? [target] : [];
  }
  return listTargets(deps.db, input.workspaceId, input.projectId);
}

export async function listTargetsFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  const targets = await targetsForProject(deps, input);
  return { status: 200, body: { data: targets.map((target) => mapTarget(target)) } };
}

export async function getCurrentScopeFlow(
  deps: BffDeps,
  input: { workspaceId: string; projectId: string },
): Promise<RouteResult> {
  await authorizeProject(deps.db, deps.session, input.workspaceId, input.projectId);
  const targets = await targetsForProject(deps, input);
  let scope: Awaited<ReturnType<typeof getActiveScopeForTarget>> = null;
  for (const target of targets) {
    const candidate = await getActiveScopeForTarget(deps.db, input.workspaceId, target.id);
    if (candidate && candidate.projectId === input.projectId) {
      scope = candidate;
      break;
    }
  }
  if (!scope) throw DbError.notFound("authorization_scope", "current");
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
  const [targets, environments] = await Promise.all([
    targetsForProject(deps, input),
    listEnvironments(deps.db, input.workspaceId, input.projectId),
  ]);
  const entries = await Promise.all(
    targets.map(async (target) => {
      const scope = await getActiveScopeForTarget(deps.db, input.workspaceId, target.id);
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
      return environments.map((environment) => ({
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
        scope: inScope && scope?.permittedEnvironmentId === environment.id ? inScope : null,
      }));
    }),
  );
  return {
    status: 200,
    body: {
      data: {
        project: { id: project.id, name: project.name, slug: project.slug },
        targets: entries.flat(),
      },
    },
  };
}
