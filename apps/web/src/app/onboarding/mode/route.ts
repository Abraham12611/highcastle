/**
 * POST /onboarding/mode — store the Builder/Developer presentation preference.
 * Same backend for both modes; this is a preference cookie, not a security
 * boundary (authorization never depends on it).
 */

import { assertSameOrigin } from "../../../server/auth/csrf";
import { MODE_COOKIE } from "../../../lib/auth/session-core";

export async function POST(request: Request): Promise<Response> {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  let mode: unknown;
  try {
    mode = ((await request.json()) as { mode?: unknown }).mode;
  } catch {
    mode = null;
  }
  if (mode !== "builder" && mode !== "developer") {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: 'mode must be "builder" or "developer".' } },
      { status: 400 },
    );
  }
  return Response.json(
    { mode },
    {
      status: 200,
      headers: {
        "set-cookie": `${MODE_COOKIE}=${mode}; Path=/; SameSite=Lax; Max-Age=31536000`,
      },
    },
  );
}
