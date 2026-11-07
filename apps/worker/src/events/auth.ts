import type { ScanAuthorization, Session } from "./ports.js";

/**
 * Session + authorization seam for the stream endpoint.
 *
 * L05 owns session resolution (Better Auth) and L02 owns the
 * membership/scan join; until both land, the ONLY safe default is to deny.
 * `resolveSession` returns `null` (no authenticated user → HTTP 401) and
 * `failClosedAuthorizer` denies every scan read (→ HTTP 404, indistinguishable
 * from a missing scan). There is no test bypass, query-string token, or
 * development backdoor — tests inject fakes through the `ScanAuthorization`
 * port instead.
 */
export async function resolveSession(): Promise<Session | null> {
  // L05 INTEGRATION POINT: replace with Better Auth session lookup, e.g.
  // `auth.api.getSession({ headers })` mapped to `{ userId }`.
  return null;
}

export const failClosedAuthorizer: ScanAuthorization = {
  async authorizeScanRead(): Promise<null> {
    return null;
  },
};
