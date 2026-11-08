"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Callout,
  CodeBlock,
  Icon,
  Panel,
  PanelBody,
  PanelHeader,
  StatusPill,
} from "@highcastle/ui";

/**
 * GitHub source integration UI (L13). All state comes from the BFF —
 * never rendered from cached/mock data. The OAuth redirect goes to
 * Composio's hosted consent; the app only ever sees read results.
 */

interface ConnectionState {
  id: string;
  status: string;
  githubLogin: string | null;
}
interface SourceState {
  repoId: string;
  fullName: string;
  defaultBranch: string;
  commitSha: string;
  recon: unknown;
}
interface StatusData {
  connection: ConnectionState | null;
  source: SourceState | null;
}
interface RepoRow {
  id: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-highcastle-request": "1", ...init?.headers },
  });
  const body = (await res.json()) as { data?: T; error?: { code?: string; message?: string } };
  if (!res.ok)
    throw new Error(`${body.error?.code ?? res.status}: ${body.error?.message ?? "failed"}`);
  return (body.data ?? body) as T;
}

export function GithubIntegration() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<StatusData>("/api/v1/integrations/github"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load status");
    }
  }, []);

  useEffect(() => {
    let live = true;
    api<StatusData>("/api/v1/integrations/github")
      .then((d) => {
        if (live) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : "failed to load status");
      });
    return () => {
      live = false;
    };
  }, []);

  const connect = async () => {
    setBusy("connect");
    try {
      const out = await api<{ redirectUrl: string }>("/api/v1/integrations/github/connect", {
        method: "POST",
        body: "{}",
      });
      window.location.assign(out.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "connect failed");
      setBusy(null);
    }
  };

  const loadRepos = async () => {
    setBusy("repos");
    try {
      const out = await api<{ repos: RepoRow[] }>("/api/v1/integrations/github/repos?per_page=50");
      setRepos(out.repos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "repo list failed");
    } finally {
      setBusy(null);
    }
  };

  const select = async (repo: RepoRow) => {
    setBusy(repo.id);
    try {
      await api("/api/v1/integrations/github/source", {
        method: "POST",
        body: JSON.stringify({ repoId: repo.id, fullName: repo.fullName }),
      });
      setRepos(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "selection failed");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await api("/api/v1/integrations/github", { method: "DELETE" });
      setRepos(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "disconnect failed");
    } finally {
      setBusy(null);
    }
  };

  const conn = data?.connection ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Callout tone="policy" title="Repository consent is separate from sign-in">
        Connecting GitHub grants HighCastle read-only access to repositories you explicitly select.
        Sign-in identity does not authorize repository access — this consent does.
      </Callout>

      {error ? (
        <Callout tone="danger" title="Request failed">
          {error}
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader
          title="GitHub connection"
          actions={
            conn ? (
              <StatusPill
                tone={
                  conn.status === "active" ? "mint" : conn.status === "pending" ? "amber" : "slate"
                }
                icon={conn.status === "active" ? "check-circle" : "clock"}
                label={conn.status}
              />
            ) : (
              <StatusPill tone="slate" icon="x-circle" label="not connected" />
            )
          }
        />
        <PanelBody className="flex flex-col gap-4">
          {conn?.githubLogin ? (
            <p className="text-sm text-hc-muted">
              Connected account: <span className="hc-mono text-hc-text">@{conn.githubLogin}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {!conn || conn.status !== "active" ? (
              <Button onClick={connect} loading={busy === "connect"} icon="external-link">
                {conn?.status === "pending" ? "Resume GitHub authorization" : "Connect GitHub"}
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={loadRepos} loading={busy === "repos"}>
                  List accessible repositories
                </Button>
                <Button variant="destructive" onClick={disconnect} loading={busy === "disconnect"}>
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </PanelBody>
      </Panel>

      {repos ? (
        <Panel>
          <PanelHeader title="Choose exactly one repository" />
          <PanelBody>
            <ul className="flex flex-col gap-2">
              {repos.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-[4px] border border-hc-line px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="hc-mono truncate text-sm text-hc-text">{r.fullName}</p>
                    <p className="text-xs text-hc-subtle">
                      {r.private ? "private" : "public"} · {r.defaultBranch}
                      {r.description ? ` · ${r.description}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === r.id}
                    onClick={() => select(r)}
                  >
                    Select
                  </Button>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}

      {data?.source ? (
        <Panel>
          <PanelHeader title="Selected source snapshot" />
          <PanelBody className="flex flex-col gap-3">
            <dl className="hc-scope-list">
              <dt>Repository</dt>
              <dd className="hc-mono">{data.source.fullName}</dd>
              <dt>Branch</dt>
              <dd className="hc-mono">{data.source.defaultBranch}</dd>
              <dt>Commit SHA</dt>
              <dd className="hc-mono">{data.source.commitSha}</dd>
            </dl>
            {data.source.recon ? (
              <details>
                <summary className="cursor-pointer text-sm text-hc-cyan">
                  Source-only reconnaissance (unverified)
                </summary>
                <CodeBlock
                  code={JSON.stringify(data.source.recon, null, 2)}
                  language="json"
                  className="mt-3"
                />
              </details>
            ) : null}
            <p className="text-xs text-hc-subtle">
              <Icon name="info" size={12} /> Source analysis is unverified — repository metadata
              alone cannot prove a runtime vulnerability.
            </p>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
