/** In-memory fixed-window limiter. Fine for a single-instance deployment. */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): { allowed: boolean; retryAfterS: number } {
    const now = this.now();
    if (this.windows.size > 10_000) this.prune(now);

    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    w.count++;
    return { allowed: w.count <= this.limit, retryAfterS: Math.ceil((w.resetAt - now) / 1000) };
  }

  private prune(now: number) {
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
  }
}
