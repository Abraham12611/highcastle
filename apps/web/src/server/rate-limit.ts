/**
 * Fixed-window in-memory rate limiter (single instance).
 *
 * H-scope protection against accidental scan-launch loops and credential
 * stuffing, not a distributed defense: each server instance tracks its own
 * counters. L19 replaces this with shared storage when the control plane
 * scales past one instance.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number = 60_000,
  ) {}

  /** Returns true when the call is allowed (and counted). */
  allow(key: string, now: number = Date.now()): boolean {
    const current = this.hits.get(key);
    if (!current || now >= current.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
