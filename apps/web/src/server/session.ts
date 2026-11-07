/**
 * Session seam for the BFF.
 *
 * L05 owns real sessions (Better Auth). Until that lands, every request
 * carries the locked demo-guest session: the intentionally public synthetic
 * tenant from AGENTS.md. The guest is server-fixed — no header, cookie, or
 * query param can choose or widen it — so "signing in" as anyone else is
 * impossible and every authorization check below reduces to comparing
 * workspace IDs.
 */
export type Session = { kind: "guest" } | { kind: "user"; userId: string };

export async function resolveSession(): Promise<Session> {
  // L05 INTEGRATION POINT: inspect the Better Auth session cookie / bearer
  // token here and return `{ kind: "user", userId }` when valid. Until then
  // the demo guest is the only session shape in existence.
  return { kind: "guest" };
}

export function sessionUserId(session: Session): string | null {
  return session.kind === "user" ? session.userId : null;
}
