/**
 * Workspace authorization adapter for L17/L18 (L05).
 *
 * Authentication ≠ authorization. These functions answer: MAY this session do
 * ACTION against WORKSPACE-scope objects? Rules:
 *
 *   - demo sessions: read-only access to DEMO_WORKSPACE_ID only. Every other
 *     workspace, every mutation, every target/pack choice, and any verdict
 *     write is denied — a guest can never elevate, change the scan target,
 *     submit a URL, or supply an oracle verdict.
 *   - account sessions: workspace membership decides, via the injected
 *     MembershipPort (L18 wires it to @highcastle/db getWorkspaceMember —
 *     no DB import here, no circular dep). Without a membership backend the
 *     policy fails CLOSED.
 */

import {
  DEMO_PACK_ID,
  DEMO_PROJECT_ID,
  DEMO_SCOPE_ID,
  DEMO_TARGET_ALIAS,
  DEMO_WORKSPACE_ID,
  type HighCastleSession,
} from "../../lib/auth/session-core";

/**
 * Bounded parameters a create-scan / create-replay request declares. For demo
 * sessions EVERY field must equal the fixed demo constant — a guest inherits
 * the pre-approved demo scope and may run only the known pack against the
 * owned lab alias. Any deviation (foreign workspace/project/host/pack/scope,
 * or any supplied verdict) denies.
 */
export interface BoundedRequest {
  projectId?: string;
  targetAlias?: string;
  packId?: string;
  scopeId?: string;
}

export type WorkspaceAction =
  | { type: "read-scan"; workspaceId: string }
  | { type: "read-project"; workspaceId: string }
  | { type: "read-events"; workspaceId: string }
  | ({ type: "create-scan"; workspaceId: string } & BoundedRequest)
  | { type: "cancel-scan"; workspaceId: string }
  | ({ type: "create-replay"; workspaceId: string } & BoundedRequest)
  | { type: "write-verdict"; workspaceId: string }
  | { type: "manage-scope"; workspaceId: string };

/** L18 provides the DB-backed lookup; tests inject fakes. */
export interface MembershipPort {
  getWorkspaceRole(workspaceId: string, userId: string): Promise<string | null>;
}

const READ_ACTIONS = new Set(["read-scan", "read-project", "read-events"]);
const MEMBER_MUTATIONS = new Set(["create-scan", "cancel-scan", "create-replay"]);

export async function authorizeWorkspaceAction(
  session: HighCastleSession,
  action: WorkspaceAction,
  membership?: MembershipPort,
): Promise<boolean> {
  if (session.kind === "demo") {
    if (action.workspaceId !== DEMO_WORKSPACE_ID) return false;
    if (READ_ACTIONS.has(action.type)) return true;
    if (action.type === "create-scan" || action.type === "create-replay") {
      // Guests may initiate ONLY the fixed demo assessment/replay: the
      // workspace, project, target alias, pack and scope are all server-fixed.
      return (
        action.projectId === DEMO_PROJECT_ID &&
        action.targetAlias === DEMO_TARGET_ALIAS &&
        action.packId === DEMO_PACK_ID &&
        action.scopeId === DEMO_SCOPE_ID
      );
    }
    return false;
  }

  // Account sessions: membership is mandatory — absence of a backend denies.
  if (!membership) return false;
  const role = await membership.getWorkspaceRole(action.workspaceId, session.userId);
  if (!role) return false;
  if (role === "owner" || role === "admin") return action.type !== "write-verdict";
  if (role === "developer") return READ_ACTIONS.has(action.type) || MEMBER_MUTATIONS.has(action.type);
  return READ_ACTIONS.has(action.type); // viewer
}

export interface ScanScope {
  workspaceId: string;
  projectId: string;
}

/**
 * L17 StreamAuthorizer-compatible scan-read check. Returns the scan's scope
 * when the session may read it, else `null` (caller answers 404 — a denied
 * scan is indistinguishable from a missing one).
 *
 * `lookupScan` is provided by the caller (L18/L02-backed): it returns the
 * scan's owning workspace + project, or null if the scan doesn't exist.
 */
export async function authorizeScanRead(
  session: HighCastleSession,
  scanId: string,
  lookupScan: (scanId: string) => Promise<ScanScope | null>,
  membership?: MembershipPort,
): Promise<ScanScope | null> {
  const scope = await lookupScan(scanId);
  if (!scope) return null;
  const allowed = await authorizeWorkspaceAction(
    session,
    { type: "read-scan", workspaceId: scope.workspaceId },
    membership,
  );
  return allowed ? scope : null;
}
