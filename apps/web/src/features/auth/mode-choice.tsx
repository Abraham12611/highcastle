"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Builder vs Developer onboarding choice. Saved in two places:
 * - the unsigned `hc_mode` cookie (presentation default, works today), and
 * - `PATCH /api/v1/me/preferences` (server-persisted per-user preference,
 *   E12 contract) — best-effort: 404 means E12's endpoint has not merged
 *   yet, 403 means a demo session with nothing persisted. Either way the
 *   cookie path keeps the choice working; nothing here invents an account.
 */
export function ModeChoice() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function choose(mode: "builder" | "developer") {
    setPending(true);
    await fetch("/onboarding/mode", {
      method: "POST",
      headers: { "content-type": "application/json", "x-highcastle-request": "1" },
      body: JSON.stringify({ mode }),
    });
    try {
      await fetch("/api/v1/me/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ experienceMode: mode }),
      });
    } catch {
      // Unmerged endpoint or unreachable API: the cookie preference stands.
    }
    router.push("/demo");
  }

  return (
    <div>
      <h2>How do you want to see HighCastle?</h2>
      <button type="button" disabled={pending} onClick={() => void choose("builder")}>
        Builder — plain-language proof for security-minded builders
      </button>
      <button type="button" disabled={pending} onClick={() => void choose("developer")}>
        Developer — raw events, assertions and evidence detail
      </button>
    </div>
  );
}
