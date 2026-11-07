"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Session-aware auth panel built ONLY on E5's stable session contract:
 * - GET /api/auth/session → 401 signed out, else { session: { kind } }
 * - POST /api/auth/demo mints the limited guest session (see DemoEntryButton)
 * - DELETE /api/auth/demo revokes it
 *
 * No provider SDKs are referenced here. When E5 lands account auth
 * (Better Auth per their README, or Clerk per coordinator order), the
 * "account" branch below lights up with zero UI changes: it already
 * renders any non-demo session kind the contract returns.
 */

export type SessionView =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "demo"; expiresAt: string | null; workspaceSlug?: string }
  | { state: "account"; userId: string }
  | { state: "failed"; message: string };

interface SessionPayload {
  session?: {
    kind?: string;
    userId?: string;
    expiresAt?: string;
  };
}

/** Pure mapper — unit-tested; the component only fetches and renders. */
export function toSessionView(status: number, body: unknown): SessionView {
  if (status === 401) return { state: "signed-out" };
  if (status !== 200 || typeof body !== "object" || body === null) {
    return { state: "failed", message: `Session check failed (${status}).` };
  }
  const session = (body as { data?: unknown }).data;
  if (typeof session !== "object" || session === null) {
    return { state: "failed", message: "Session response had no usable payload." };
  }
  const payload = session as SessionPayload;
  const kind = payload.session?.kind;
  if (kind === "demo") {
    return { state: "demo", expiresAt: payload.session?.expiresAt ?? null };
  }
  if (typeof kind === "string" && kind.length > 0) {
    return { state: "account", userId: payload.session?.userId ?? "account" };
  }
  return { state: "failed", message: "Session response had no usable payload." };
}

async function revokeDemo(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/demo", {
      method: "DELETE",
      headers: { "x-highcastle-request": "1" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function SessionPanel({
  returnTo = "/app",
  signedOutSlot,
}: {
  returnTo?: string;
  /** Rendered instead of the default sign-in links (e.g. demo entry on the sign-in page itself). */
  signedOutSlot?: React.ReactNode;
}) {
  const [view, setView] = useState<SessionView>({ state: "loading" });
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "same-origin" });
        const body = (await res.json().catch(() => null)) as unknown;
        if (!cancelled) setView(toSessionView(res.status, body));
      } catch {
        if (!cancelled) setView({ state: "failed", message: "Could not reach the session service." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (view.state === "loading") return <p aria-live="polite">Checking session…</p>;
  if (view.state === "failed") {
    return (
      <div role="alert">
        <p>{view.message}</p>
        <p>
          <Link href={returnTo === "/app" ? "/app" : `/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
            Continue anyway
          </Link>{" "}
          or reload to retry.
        </p>
      </div>
    );
  }
  if (view.state === "demo") {
    return (
      <div>
        <p>
          <strong>Limited guest session active.</strong> Synthetic invoice lab
          only; expires {view.expiresAt ?? "within the hour"}.
        </p>
        <p>
          <Link href="/app">Open the dashboard</Link>
        </p>
        <button
          type="button"
          disabled={revoking}
          onClick={() =>
            void (async () => {
              setRevoking(true);
              const ok = await revokeDemo();
              setRevoking(false);
              setView(
                ok
                  ? { state: "signed-out" }
                  : { state: "failed", message: "Could not revoke the demo session." },
              );
            })()
          }
        >
          {revoking ? "Signing out…" : "Sign out of the demo session"}
        </button>
      </div>
    );
  }
  if (view.state === "account") {
    return (
      <div>
        <p>
          Signed in as account <code>{view.userId}</code>.
        </p>
        <p>
          <Link href="/app">Open the dashboard</Link>
        </p>
      </div>
    );
  }
  if (signedOutSlot) return <>{signedOutSlot}</>;
  return (
    <div>
      <p>You are signed out.</p>
      <p>
        <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link> ·{" "}
        <Link href="/get-started">Get started</Link>
      </p>
    </div>
  );
}
