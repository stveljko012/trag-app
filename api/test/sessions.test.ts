import { describe, expect, it } from 'vitest';
import { needsRefresh, SESSION_REFRESH_MS, SESSION_TTL_MS } from '../src/auth/sessions.js';

describe('needsRefresh', () => {
  const now = Date.UTC(2026, 9, 30);

  it('does not refresh a session issued less than a day ago', () => {
    const expiresAt = new Date(now + SESSION_TTL_MS - SESSION_REFRESH_MS + 1000);
    expect(needsRefresh(expiresAt, now)).toBe(false);
  });

  it('refreshes once more than a day has passed', () => {
    const expiresAt = new Date(now + SESSION_TTL_MS - SESSION_REFRESH_MS - 1000);
    expect(needsRefresh(expiresAt, now)).toBe(true);
  });
});
