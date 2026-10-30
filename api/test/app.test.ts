import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { TraccarClient } from '../src/traccar/traccar.js';
import type { Db } from '../src/db/client.js';

let app: ReturnType<typeof buildApp>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'trag-public-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Trag</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');
  const db = { execute: async () => ({ rows: [] }) } as unknown as Db;
  app = buildApp({
    db,
    traccar: {} as TraccarClient,
    publicDir: dir,
    sessionSecret: 'x'.repeat(32),
    secureCookies: false,
  });
});

describe('app routing', () => {
  it('serves /api/health', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });

  it('requires a session for other /api routes and never returns the SPA', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Niste prijavljeni' });
  });

  it('rejects /api/auth/me without a session', async () => {
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('validates the login body', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
  });

  it('serves static files', async () => {
    const res = await app.request('/app.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('console.log(1)');
  });

  it('falls back to index.html for client routes', async () => {
    const res = await app.request('/history');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>Trag</title>');
  });
});
