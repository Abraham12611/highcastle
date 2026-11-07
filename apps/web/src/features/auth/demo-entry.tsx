"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Public demo entry: mints the server-issued limited guest session via
 * POST /api/auth/demo, then forwards into the demo experience (L07's route).
 * The button does NOT carry credentials — the session is minted by the server.
 */
export function DemoEntryButton({ href = "/demo" }: { href?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "x-highcastle-request": "1" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? `Demo unavailable (${res.status}).`);
        return;
      }
      router.push(href);
    } catch {
      setError("Could not reach the demo service. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={enter} disabled={pending}>
        {pending ? "Starting safe demo…" : "Try the live demo"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <p>
        <small>
          Runs against HighCastle&apos;s own synthetic invoice lab only. No sign-up
          required; a limited server-issued session is created for you.
        </small>
      </p>
    </div>
  );
}
