import { zValidator } from '../validation.js';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  clearSessionCookie,
  clientIp,
  readSessionId,
  requireAuth,
  setSessionCookie,
} from '../auth/middleware.js';
import { getDummyHash, verifyPassword } from '../auth/password.js';
import { FixedWindowLimiter } from '../auth/rateLimit.js';
import { createSession, deleteSession } from '../auth/sessions.js';
import { findUserByEmail } from '../auth/users.js';
import type { AppDeps, AppEnv } from '../types.js';

const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
});

export function authRoutes(deps: AppDeps) {
  const loginLimiter = new FixedWindowLimiter(10, 15 * 60 * 1000);

  return new Hono<AppEnv>()
    .post('/login', async (c, next) => {
      const { allowed, retryAfterS } = loginLimiter.hit(clientIp(c));
      if (!allowed) {
        c.header('Retry-After', String(retryAfterS));
        return c.json({ error: 'Previše pokušaja. Pokušajte ponovo kasnije.' }, 429);
      }
      await next();
    })
    .post('/login', zValidator('json', loginSchema), async (c) => {
      const { email, password } = c.req.valid('json');
      const user = await findUserByEmail(deps.db, email);
      const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
      if (!user || !ok) return c.json({ error: 'Pogrešan email ili lozinka' }, 401);

      const sessionId = await createSession(deps.db, user.id);
      await setSessionCookie(c, deps, sessionId);
      const { passwordHash: _, ...publicUser } = user;
      return c.json({ user: publicUser });
    })
    .post('/logout', async (c) => {
      const sessionId = await readSessionId(c, deps);
      if (sessionId) await deleteSession(deps.db, sessionId);
      clearSessionCookie(c, deps);
      return c.body(null, 204);
    })
    .get('/me', requireAuth(deps), (c) => c.json({ user: c.get('user') }));
}
