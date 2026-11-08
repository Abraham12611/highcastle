import {
  createSourceConnection,
  getActiveSourceConnection,
  getRepoSource,
  saveReconResult,
  updateSourceConnection,
  upsertRepoSource,
} from "@highcastle/db";
import {
  ComposioUnavailable,
  composioClient,
  createGithubSession,
  executeRead,
  githubConnectionState,
  resumeSession,
} from "./composio";
import type { BffDeps } from "./deps";
import { analyzePackageJson, buildRecon, classifyPaths } from "./source-recon";
import type { RouteResult } from "./scans";

/**
 * GitHub source flows (L13). Every step is owner-scoped: the signed-in
 * user's session.userId is the consent owner for connection rows and
 * tool execution alike. Demo guests cannot connect GitHub — the demo
 * session is pinned to the synthetic lab by design.
 */

function requireAccount(deps: BffDeps): string {
  if (deps.session.kind !== "account") {
    const err = new Error("GitHub connect requires a signed-in account") as Error & {
      status?: number;
      code?: string;
    };
    err.status = 403;
    err.code = "account_required";
    throw err;
  }
  return deps.session.userId;
}

const ok = (data: unknown, status = 200): RouteResult => ({ status, body: { data } });
const err = (code: string, message: string, status: number): RouteResult => ({
  status,
  body: { error: { code, message } },
});

/** POST /connect — mint session + Composio auth link for the user. */
export async function connectFlow(
  deps: BffDeps,
  { callbackUrl, appOrigin }: { callbackUrl: string; appOrigin: string },
): Promise<RouteResult> {
  const ownerId = requireAccount(deps);
  if (!/^https?:\/\//.test(callbackUrl) || new URL(callbackUrl).origin !== appOrigin) {
    return err("invalid_callback", "callbackUrl must be a same-origin app URL", 400);
  }
  const session = await createGithubSession(ownerId);
  const req = await session.authorize("github", { callbackUrl });
  const conn = await createSourceConnection(deps.db, {
    ownerUserId: ownerId,
    composioSessionId: session.sessionId,
    authConfigId: process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID ?? "ac_asSNztl9HSiB",
  });
  return ok(
    {
      connectionId: conn.id,
      redirectUrl: req.redirectUrl,
      status: "pending",
      notice:
        "GitHub authorization is requested through Composio's hosted consent. " +
        "This is separate from sign-in — you are granting repository read access.",
    },
    201,
  );
}

/** Refresh a pending/active row against Composio's truth. */
async function refreshStatus(deps: BffDeps, ownerId: string) {
  const conn = await getActiveSourceConnection(deps.db, ownerId);
  if (!conn) return null;
  if (conn.status === "pending" || conn.status === "active") {
    const session = await resumeSession(conn.composioSessionId);
    const state = await githubConnectionState(session);
    if (state.isActive && conn.status !== "active") {
      let login: string | undefined;
      try {
        const me = (await executeRead(session, "GITHUB_GET_THE_AUTHENTICATED_USER", {})) as {
          login?: string;
        };
        login = me?.login;
      } catch {
        /* login lookup best-effort */
      }
      return updateSourceConnection(deps.db, conn.id, {
        status: "active",
        composioConnectedAccountId: state.connectedAccountId ?? null,
        githubLogin: login ?? null,
      });
    }
    if (!state.isActive && conn.status === "active") {
      return updateSourceConnection(deps.db, conn.id, { status: "revoked" });
    }
  }
  return conn;
}

/** GET — connection + selected source state for the owner. */
export async function statusFlow(deps: BffDeps): Promise<RouteResult> {
  const ownerId = requireAccount(deps);
  const conn = await refreshStatus(deps, ownerId);
  if (!conn) return ok({ connection: null });
  const source = await getRepoSource(deps.db, ownerId, conn.id);
  return ok({
    connection: {
      id: conn.id,
      status: conn.status,
      githubLogin: conn.githubLogin,
      connectedAt: conn.updatedAt,
    },
    source: source
      ? {
          id: source.id,
          repoId: source.repoId,
          fullName: source.fullName,
          defaultBranch: source.defaultBranch,
          commitSha: source.commitSha,
          selectedAt: source.selectedAt,
          recon: source.reconResult,
        }
      : null,
  });
}

/** GET /repos — paginated accessible repos via the read allowlist. */
export async function reposFlow(
  deps: BffDeps,
  { page, perPage }: { page: number; perPage: number },
): Promise<RouteResult> {
  const ownerId = requireAccount(deps);
  const conn = await refreshStatus(deps, ownerId);
  if (!conn || conn.status !== "active") {
    return err("connection_pending", "GitHub authorization is not complete.", 409);
  }
  const session = await resumeSession(conn.composioSessionId);
  const data = (await executeRead(session, "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", {
    page,
    per_page: perPage,
    affiliation: "owner,collaborator,organization_member",
  })) as { repositories?: unknown[] } | unknown[];
  const list = Array.isArray(data) ? data : (data.repositories ?? []);
  const repos = list.map((r) => {
    const repo = r as Record<string, unknown>;
    return {
      id: String(repo.id ?? ""),
      fullName: String(repo.full_name ?? ""),
      private: repo.private === true,
      defaultBranch: String(repo.default_branch ?? "main"),
      description: typeof repo.description === "string" ? repo.description : null,
      updatedAt: typeof repo.updated_at === "string" ? repo.updated_at : null,
      htmlUrl: typeof repo.html_url === "string" ? repo.html_url : null,
    };
  });
  return ok({ repos, page, perPage });
}

/** POST /source — explicit repo opt-in: snapshot identity + SHA + recon. */
export async function selectRepoFlow(
  deps: BffDeps,
  input: { repoId: string; fullName: string },
): Promise<RouteResult> {
  const ownerId = requireAccount(deps);
  const conn = await refreshStatus(deps, ownerId);
  if (!conn || conn.status !== "active") {
    return err("connection_pending", "GitHub authorization is not complete.", 409);
  }
  const m = /^([^/\s]+)\/([^/\s]+)$/.exec(input.fullName);
  if (!m || !m[1] || !m[2]) return err("invalid_repo", "fullName must be owner/repo", 400);
  const owner = m[1];
  const repo = m[2];
  const session = await resumeSession(conn.composioSessionId);

  const meta = (await executeRead(session, "GITHUB_GET_A_REPOSITORY", { owner, repo }).catch(
    (e: Error) => ({ __error: e.message }),
  )) as Record<string, unknown>;
  if (meta.__error) return err("repo_unavailable", String(meta.__error), 502);
  if (String(meta.id ?? "") !== input.repoId) {
    return err("repo_mismatch", "Repository does not match the listed selection.", 409);
  }
  const defaultBranch = String(meta.default_branch ?? "main");

  // Immutable chosen revision: head of the default branch.
  const branches = (await executeRead(session, "GITHUB_LIST_BRANCHES", {
    owner,
    repo,
    per_page: 100,
  })) as unknown[];
  const branch = (Array.isArray(branches) ? branches : []).find(
    (b) => (b as { name?: string }).name === defaultBranch,
  ) as { commit?: { sha?: string } } | undefined;
  const commitSha = branch?.commit?.sha;
  if (!commitSha) return err("sha_unavailable", "Could not resolve the default-branch SHA.", 502);

  const source = await upsertRepoSource(deps.db, {
    connectionId: conn.id,
    ownerUserId: ownerId,
    repoId: input.repoId,
    fullName: input.fullName,
    defaultBranch,
    commitSha,
    repoMeta: { private: meta.private === true, htmlUrl: meta.html_url ?? null },
  });

  // Source-only recon: root listing + package manifests. Never executes.
  const recon = await runRecon(session, owner, repo, defaultBranch);
  await saveReconResult(deps.db, source.id, recon);

  return ok(
    {
      id: source.id,
      repoId: source.repoId,
      fullName: source.fullName,
      defaultBranch,
      commitSha,
      recon,
    },
    201,
  );
}

async function runRecon(
  session: Awaited<ReturnType<typeof resumeSession>>,
  owner: string,
  repo: string,
  branch: string,
) {
  const tree = (await executeRead(session, "GITHUB_GET_A_TREE", {
    owner,
    repo,
    tree_sha: branch,
    recursive: "1",
  }).catch(() => ({ tree: [] }))) as { tree?: { path?: string; type?: string }[] };
  const paths = (tree.tree ?? [])
    .filter((t) => t.type === "blob" && t.path)
    .map((t) => t.path as string)
    .slice(0, 4000);

  const { manifests } = classifyPaths(paths);
  const observations: ReturnType<typeof analyzePackageJson> = [];
  const frameworks: string[] = [];
  for (const manifest of manifests.filter((p) => p.endsWith("package.json")).slice(0, 6)) {
    const file = (await executeRead(session, "GITHUB_GET_REPOSITORY_CONTENT", {
      owner,
      repo,
      path: manifest,
      ref: branch,
    }).catch(() => null)) as { content?: string; encoding?: string } | null;
    if (file?.content && file.encoding === "base64") {
      const text = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
      const obs = analyzePackageJson(manifest, text);
      observations.push(...obs);
      for (const o of obs) {
        const name = o.key.split(":")[1];
        if (o.key.startsWith("framework:") && name && !frameworks.includes(name)) {
          frameworks.push(name);
        }
      }
    }
  }
  return buildRecon({ paths, frameworks, observations });
}

/** DELETE — disconnect: revoke at Composio + tombstone the row. */
export async function disconnectFlow(deps: BffDeps): Promise<RouteResult> {
  const ownerId = requireAccount(deps);
  const conn = await getActiveSourceConnection(deps.db, ownerId);
  if (!conn) return err("not_connected", "No GitHub connection exists.", 404);
  if (conn.composioConnectedAccountId) {
    try {
      await composioClient().connectedAccounts.revoke(conn.composioConnectedAccountId);
    } catch {
      /* revocation best-effort — the local tombstone still applies */
    }
  }
  await updateSourceConnection(deps.db, conn.id, {
    status: "disconnected",
    disconnectedAt: new Date(),
  });
  return ok({ status: "disconnected" });
}

export { ComposioUnavailable };
