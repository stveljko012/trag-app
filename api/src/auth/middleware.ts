import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { AppDeps, AppEnv } from '../types.js';
import { extendSession, getSession, needsRefresh, SESSION_TTL_MS } from './sessions.js';

export const SESSION_COOKIE = 'trag_session';

export async function setSessionCookie(c: Context, deps: AppDeps, sessionId: string) {
  await setSignedCookie(c, SESSION_COOKIE, sessionId, deps.sessionSecret, {
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context, deps: AppDeps) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: deps.secureCookies });
}

export async function readSessionId(c: Context, deps: AppDeps): Promise<string | null> {
  const value = await getSignedCookie(c, deps.sessionSecret, SESSION_COOKIE);
  return typeof value === 'string' && value ? value : null;
}

export function requireAuth(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sessionId = await readSessionId(c, deps);
    const session = sessionId ? await getSession(deps.db, sessionId) : null;
    if (!session) {
      if (sessionId) clearSessionCookie(c, deps);
      return c.json({ error: 'Niste prijavljeni' }, 401);
    }
    if (needsRefresh(session.expiresAt)) {
      await extendSession(deps.db, session.id);
      await setSessionCookie(c, deps, session.id);
    }
    c.set('user', session.user);
    c.set('sessionId', session.id);
    await next();
  };
}

/** Client IP. Trag is only reachable through Caddy, which sets X-Forwarded-For. */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Lets only owners through; use after requireAuth. */
export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user').role !== 'owner') {
    return c.json({ error: 'Samo vlasnik naloga može da menja ove podatke' }, 403);
  }
  await next();
};
