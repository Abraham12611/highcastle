/**
 * In-process fanout for live SSE loops. This is an acceleration only: the
 * database remains the source of truth, and every loop re-polls the store,
 * so a lost or duplicate wakeup can delay but never lose or duplicate an
 * event on the wire (delivery dedupes by seq).
 */
export class EventHub {
  private readonly waiters = new Map<string, Set<() => void>>();

  /** Wake loops currently waiting on this scan. */
  notify(scanId: string): void {
    const pending = this.waiters.get(scanId);
    if (!pending || pending.size === 0) return;
    const wakeups = [...pending];
    pending.clear();
    for (const wake of wakeups) wake();
  }

  /** Resolve once the scan is notified or the signal aborts. */
  waitFor(scanId: string, signal: AbortSignal): Promise<"notified" | "aborted"> {
    if (signal.aborted) return Promise.resolve("aborted");
    return new Promise<"notified" | "aborted">((resolve) => {
      const wake = (): void => {
        signal.removeEventListener("abort", onAbort);
        this.discard(scanId, wake);
        resolve("notified");
      };
      const onAbort = (): void => {
        this.discard(scanId, wake);
        resolve("aborted");
      };
      let set = this.waiters.get(scanId);
      if (!set) {
        set = new Set();
        this.waiters.set(scanId, set);
      }
      set.add(wake);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** Waiters currently parked per scan (observability for tests/ops). */
  pendingCount(scanId?: string): number {
    if (scanId !== undefined) return this.waiters.get(scanId)?.size ?? 0;
    let total = 0;
    for (const set of this.waiters.values()) total += set.size;
    return total;
  }

  private discard(scanId: string, wake: () => void): void {
    const set = this.waiters.get(scanId);
    if (!set) return;
    set.delete(wake);
    if (set.size === 0) this.waiters.delete(scanId);
  }
}
