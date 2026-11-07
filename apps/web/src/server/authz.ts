import {
  getProject,
  getTarget,
  getEnvironment,
  type Database,
  type DbExecutor,
} from "@highcastle/db";
import { DEMO_IDS } from "@highcastle/db";
import { DbError } from "@highcastle/db";
import { getScope } from "@highcastle/db";
import { getWorkspace, getWorkspaceMember } from "@highcastle/db";
import type { Session } from "./session";

/**
 * Tenant authorization for the BFF. Rules:
 *
 * - Guests are bound to the seeded demo workspace/project. Any other
 *   workspace or project reads as missing (404 at the route layer).
 * - Future user sessions require a workspace membership row; without one
 *   the workspace reads as missing too — never 403-with-existence.
 * - Scan/replay creation additionally requires the fixed lab binding
 *   (demo target, demo environment, demo scope), so a guest can never
 *   point execution at another host.
 */

export interface DemoBinding {
  workspaceId: string;
  projectId: string;
  targetId: string;
  environmentIds: readonly string[];
  scopeId: string;
}

export function demoBinding(): DemoBinding {
  return {
    workspaceId: DEMO_IDS.workspaceId,
    projectId: DEMO_IDS.projectId,
    targetId: DEMO_IDS.targetId,
    environmentIds: [DEMO_IDS.vulnerableEnvId, DEMO_IDS.patchedEnvId],
    scopeId: DEMO_IDS.scopeId,
  };
}

export async function authorizeWorkspace(
  db: DbExecutor,
  session: Session,
  workspaceId: string,
): Promise<{ id: string; slug: string; name: string; status: string }> {
  if (session.kind === "guest" && workspaceId !== DEMO_IDS.workspaceId) {
    throw DbError.notFound("workspace", workspaceId);
  }
  if (session.kind === "user") {
    const membership = await getWorkspaceMember(db, workspaceId, session.userId);
    if (!membership) throw DbError.notFound("workspace", workspaceId);
  }
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) throw DbError.notFound("workspace", workspaceId);
  return workspace;
}

export async function authorizeProject(
  db: DbExecutor,
  session: Session,
  workspaceId: string,
  projectId: string,
) {
  await authorizeWorkspace(db, session, workspaceId);
  if (session.kind === "guest" && projectId !== DEMO_IDS.projectId) {
    throw DbError.notFound("project", projectId);
  }
  const project = await getProject(db, workspaceId, projectId);
  if (!project) throw DbError.notFound("project", projectId);
  return project;
}

/**
 * Guests may only execute against the seeded lab triple
 * (project/target/environment). The scope itself is *not* pinned to a single
 * id here: scans run under the vulnerable-env scope while replays run under
 * a patched-env scope. Choosing among pre-existing approvals is not granting
 * — `loadExecutionScope` + the L04 policy gate verify the presented scope is
 * active and authorizes exactly this triple.
 */
export function assertDemoExecutionBinding(input: {
  projectId: string;
  targetId: string;
  environmentId: string;
}): void {
  const binding = demoBinding();
  if (
    input.projectId !== binding.projectId ||
    input.targetId !== binding.targetId ||
    !binding.environmentIds.includes(input.environmentId)
  ) {
    throw new DbError(
      "policy_denied",
      "demo execution is limited to the fixed synthetic lab binding",
    );
  }
}

export async function loadExecutionScope(
  db: DbExecutor,
  workspaceId: string,
  projectId: string,
  targetId: string,
  environmentId: string,
  scopeId: string,
) {
  const [scope, target, environment] = await Promise.all([
    getScope(db, workspaceId, scopeId),
    getTarget(db, workspaceId, targetId),
    getEnvironment(db, workspaceId, environmentId),
  ]);
  if (!scope) throw DbError.notFound("authorization_scope", scopeId);
  if (!target) throw DbError.notFound("target", targetId);
  if (!environment) throw DbError.notFound("environment", environmentId);
  if (
    scope.projectId !== projectId ||
    scope.targetId !== targetId ||
    scope.permittedEnvironmentId !== environmentId
  ) {
    throw new DbError(
      "scope_denied",
      "scope does not authorize this project/target/environment",
      { scopeId },
    );
  }
  return { scope, target, environment };
}

/**
 * Workspace implied by routes that carry no workspace path segment
 * (`GET /scans/:sid`, ...). Guests are bound to the demo tenant; user
 * sessions fail closed here until L05 wires identity → membership lookup.
 */
export function requestWorkspace(session: Session): string {
  if (session.kind === "guest") return DEMO_IDS.workspaceId;
  throw new DbError("unavailable", "authenticated sessions are not configured yet");
}

export type { Database };
