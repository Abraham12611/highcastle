"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Builder vs Developer onboarding choice. Both modes share the same backend
 * session — this only stores a presentation preference (unsigned `hc_mode`
 * cookie + `user_preferences.experience_mode` once account auth lands).
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
