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
import type { MembershipPort } from "./auth/authorize";
import type { Session } from "./session";

/**
 * Tenant authorization for the BFF. Rules:
 *
 * - Demo sessions are server-pinned to the fixed synthetic lab
 *   (L05 `session.workspaceId/projectId`). Any other workspace or project
 *   reads as missing (404 at the route layer). Demo mutations
 *   (create/cancel scan, create replay) are allowed ONLY inside that fixed
 *   workspace, and the flows additionally pin execution to the lab triple —
 *   a demo session can never point execution at another host or widen scope.
 * - Account sessions require a real workspace membership row (L02
 *   `getWorkspaceMember` wired as the L05 MembershipPort). Without one the
 *   workspace reads as missing — never 403-with-existence. Execution for
 *   accounts is authorized by pre-existing operator-approved scopes
 *   (`loadExecutionScope` + L04 policy gate), never by client claims.
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

/** L05 MembershipPort backed by L02 — no DB import inside L05's policy file. */
export function dbMembership(db: DbExecutor): MembershipPort {
  return {
    async getWorkspaceRole(workspaceId: string, userId: string) {
      const member = await getWorkspaceMember(db, workspaceId, userId);
      return member ? member.role : null;
    },
  };
}

export async function authorizeWorkspace(
  db: DbExecutor,
  session: Session,
  workspaceId: string,
): Promise<{ id: string; slug: string; name: string; status: string }> {
  if (session.kind === "demo") {
    if (workspaceId !== session.workspaceId) {
      throw DbError.notFound("workspace", workspaceId);
    }
  } else {
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
  if (session.kind === "demo" && projectId !== session.projectId) {
    throw DbError.notFound("project", projectId);
  }
  const project = await getProject(db, workspaceId, projectId);
  if (!project) throw DbError.notFound("project", projectId);
  return project;
}

/** Demo execution stays inside the fixed lab; accounts are scope-gated. */
export function assertExecutionBinding(
  session: Session,
  input: {
    projectId: string;
    targetId: string;
    environmentId: string;
  },
): void {
  if (session.kind !== "demo") return;
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
 * (`GET /scans/:sid`, ...). Demo sessions resolve to their pinned workspace.
 * Account sessions fail closed here: without a user→workspaces listing in
 * L02, mapping an unscoped id to a tenant would be guessing. Callers needing
 * account access must use the workspace-scoped routes.
 */
export async function requestWorkspace(
  db: DbExecutor,
  session: Session,
): Promise<string> {
  if (session.kind === "demo") return session.workspaceId;
  throw new DbError(
    "unavailable",
    "account sessions require workspace-scoped routes; unscoped lookup is not supported yet",
  );
}

export type { Database };
