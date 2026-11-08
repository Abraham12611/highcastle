"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Presentation mode is not a permission or execution scope.
 * Persist the cookie first; signed-in accounts additionally keep a server
 * preference. A mode selection must NOT silently enter the synthetic demo.
 */
export function ModeChoice() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<"builder" | "developer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(mode: "builder" | "developer") {
    setPending(true);
    setError(null);
    try {
      const result = await fetch("/onboarding/mode", {
        method: "POST",
        headers: { "content-type": "application/json", "x-highcastle-request": "1" },
        body: JSON.stringify({ mode }),
      });
      if (!result.ok) {
        throw new Error("Could not save your display preference. Please retry.");
      }
      // Server preference is best-effort; guests and unprovisioned accounts
      // keep the cookie preference without gaining account authority.
      await fetch("/api/v1/me/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-highcastle-request": "1" },
        body: JSON.stringify({ experienceMode: mode }),
      }).catch(() => null);
      setSelected(mode);
      router.refresh();
    } catch {
      setError("Could not save your display preference. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h2>Which experience suits you?</h2>
      <button
        type="button"
        disabled={pending}
        aria-pressed={selected === "builder"}
        onClick={() => void choose("builder")}
      >
        <strong>Builder</strong> — clear, plain-language security findings
      </button>
      <button
        type="button"
        disabled={pending}
        aria-pressed={selected === "developer"}
        onClick={() => void choose("developer")}
      >
        <strong>Developer</strong> — technical evidence, events and assertions
      </button>
      {selected ? (
        <p role="status">
          {selected === "builder" ? "Builder" : "Developer"} mode saved. Continue to add a
          source or open your dashboard.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
