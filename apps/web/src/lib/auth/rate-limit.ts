/**
 * Best-effort in-process rate limiter for demo session minting.
 *
 * Per-instance sliding window — sufficient to stop a demo crawler from
 * minting unbounded sessions on a single pod. Edge/WAF limiting remains the
 * authoritative layer (documented in README); this exists so the demo path is
 * not completely unthrottled.
 */

const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Test hook — reset all buckets between tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
