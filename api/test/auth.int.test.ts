import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { TraccarClient } from '../src/traccar/traccar.js';
import { ensureOwner } from '../src/auth/users.js';
import { migrate } from '../src/db/migrate.js';
import { createDatabase, type Database } from '../src/db/client.js';
import { sessions, users } from '../src/db/schema.js';

// Runs only against a disposable database, e.g.
// TEST_DATABASE_URL=postgres://trag:trag@localhost:5432/trag_test npm test
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('auth (integration)', () => {
  let database: Database;
  let app: ReturnType<typeof buildApp>;

  const login = (password: string, ip = '10.0.0.1') =>
    app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: ' Owner@Example.com ', password }),
    });

  beforeAll(async () => {
    database = createDatabase(url!);
    const { db } = database;
    await migrate(database);
    await db.delete(sessions);
    await db.delete(users);
    await ensureOwner(db, { email: 'owner@example.com', password: 'correct-horse', name: 'Owner' });
    app = buildApp({
      db: database.db,
      traccar: {} as TraccarClient,
      publicDir: '/nonexistent',
      sessionSecret: 's'.repeat(32),
      secureCookies: true,
    });
  });

  afterAll(async () => {
    await database?.pool.end();
  });

  it('is idempotent when seeding twice', async () => {
    const created = await ensureOwner(database.db, {
      email: 'OWNER@example.com',
      password: 'x'.repeat(12),
      name: 'X',
    });
    expect(created).toBe(false);
  });

  it('rejects a wrong password', async () => {
    const res = await login('wrong');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('logs in, reads /me, and logs out', async () => {
    const res = await login('correct-horse');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^trag_session=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({ email: 'owner@example.com', role: 'owner' });
    expect(body.user).not.toHaveProperty('password_hash');

    const cookie = setCookie.split(';')[0]!;
    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);

    const logout = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } });
    expect(logout.status).toBe(204);

    const after = await app.request('/api/auth/me', { headers: { cookie } });
    expect(after.status).toBe(401);
  });

  it('rejects a tampered cookie', async () => {
    const res = await app.request('/api/auth/me', {
      headers: { cookie: `trag_session=${'a'.repeat(64)}.bad` },
    });
    expect(res.status).toBe(401);
  });

  it('rate-limits login to 10 attempts per IP', async () => {
    for (let i = 0; i < 10; i++) expect((await login('wrong', '10.9.9.9')).status).toBe(401);
    const blocked = await login('correct-horse', '10.9.9.9');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });
});
