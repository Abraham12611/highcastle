import { Composio } from "@composio/core";

/**
 * Server-only Composio adapter (L13).
 *
 * Least privilege by construction: every GitHub session is pinned to the
 * managed auth config and an explicit read-only tool allowlist. No agent
 * ever receives this session or an unrestricted toolset — only the BFF
 * routes in api/v1/integrations/github call it, on behalf of the owning
 * signed-in user.
 */

export const GITHUB_TOOLKIT = "github" as const;

/** Read-only GitHub tools exposed to the server adapter — nothing else. */
export const GITHUB_READ_TOOLS = [
  "GITHUB_GET_THE_AUTHENTICATED_USER",
  "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
  "GITHUB_GET_A_REPOSITORY",
  "GITHUB_LIST_BRANCHES",
  "GITHUB_GET_REPOSITORY_CONTENT",
  "GITHUB_GET_A_TREE",
] as const;

export class ComposioUnavailable extends Error {
  constructor() {
    super("GitHub source integration is not configured on this deployment.");
    this.name = "ComposioUnavailable";
  }
}

let client: Composio | null = null;

export function composioClient(): Composio {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new ComposioUnavailable();
  client ??= new Composio({ apiKey });
  return client;
}

export function githubAuthConfigId(): string {
  return process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID ?? "ac_asSNztl9HSiB";
}

type Session = Awaited<ReturnType<Composio["sessions"]["create"]>>;

export async function createGithubSession(ownerUserId: string): Promise<Session> {
  return composioClient().sessions.create(ownerUserId, {
    toolkits: [GITHUB_TOOLKIT],
    authConfigs: { [GITHUB_TOOLKIT]: githubAuthConfigId() },
    tools: { [GITHUB_TOOLKIT]: [...GITHUB_READ_TOOLS] },
  });
}

export async function resumeSession(sessionId: string): Promise<Session> {
  return composioClient().sessions.use(sessionId, {});
}

export interface GithubConnectionState {
  isActive: boolean;
  connectedAccountId?: string;
  status?: string;
}

export async function githubConnectionState(session: Session): Promise<GithubConnectionState> {
  const res = await session.toolkits();
  const gh = res.items.find((t: { slug: string }) => t.slug === GITHUB_TOOLKIT);
  return {
    isActive: gh?.connection?.isActive === true,
    ...(gh?.connection?.connectedAccount?.id
      ? { connectedAccountId: gh.connection.connectedAccount.id }
      : {}),
    ...(gh?.connection?.connectedAccount?.status
      ? { status: gh.connection.connectedAccount.status }
      : {}),
  };
}

export interface ToolExecution {
  successful: boolean;
  data: unknown;
  error?: string;
}

/** Execute one allow-listed read tool; returns the raw tool data. */
export async function executeRead(
  session: Session,
  toolSlug: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!(GITHUB_READ_TOOLS as readonly string[]).includes(toolSlug)) {
    throw new Error(`tool ${toolSlug} is not on the read allowlist`);
  }
  const res = (await session.execute(toolSlug, args)) as {
    successful?: boolean;
    data?: unknown;
    error?: unknown;
  };
  if (res.successful === false) {
    const msg = typeof res.error === "string" ? res.error : `tool ${toolSlug} failed`;
    throw new Error(msg);
  }
  return res.data;
}
