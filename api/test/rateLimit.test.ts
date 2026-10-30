import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from '../src/auth/rateLimit.js';

describe('FixedWindowLimiter', () => {
  it('allows `limit` hits per window, then blocks until the window resets', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(10, 15 * 60_000, () => now);
    for (let i = 0; i < 10; i++) expect(limiter.hit('1.2.3.4').allowed).toBe(true);

    const blocked = limiter.hit('1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBe(900);

    expect(limiter.hit('5.6.7.8').allowed).toBe(true);

    now = 15 * 60_000;
    expect(limiter.hit('1.2.3.4').allowed).toBe(true);
  });
});
