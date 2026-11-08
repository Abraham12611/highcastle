/**
 * CSRF defense for cookie-authenticated mutations (L05).
 *
 * Layered model: session cookies are SameSite=Lax (cross-site POSTs never
 * carry them), and every mutating route additionally requires a same-origin
 * signal — an `Origin`/`Referer` matching the request host, OR the custom
 * header `x-highcastle-request: 1`, which cross-site HTML forms cannot set.
 * Defense in depth rather than a single mechanism.
 */

export function assertSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return Response.json(
          { error: { code: "CSRF_REJECTED", message: "Cross-origin mutation rejected." } },
          { status: 403 },
        );
      }
      return null;
    } catch {
      return Response.json(
        { error: { code: "CSRF_REJECTED", message: "Bad Origin." } },
        { status: 403 },
      );
    }
  }
  if (request.headers.get("x-highcastle-request") === "1") return null;
  const referer = request.headers.get("referer");
  if (referer && host) {
    try {
      if (new URL(referer).host === host) return null;
    } catch {
      /* fall through */
    }
  }
  return Response.json(
    {
      error: {
        code: "CSRF_REJECTED",
        message: "Mutation requires same-origin or x-highcastle-request.",
      },
    },
    { status: 403 },
  );
}
