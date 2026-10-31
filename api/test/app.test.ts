import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { type TraccarClient, TraccarError } from '../src/traccar/traccar.js';
import type { Db } from '../src/db/client.js';

let app: ReturnType<typeof buildApp>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'trag-public-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Trag</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(2)');
  const db = { execute: async () => ({ rows: [] }) } as unknown as Db;
  app = buildApp({
    db,
    traccar: {} as TraccarClient,
    publicDir: dir,
    pageTitle: 'Trag · Bašta & <Co>',
    clientName: 'Bašta',
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

  it('checks Traccar in /api/health/traccar and caches the result', async () => {
    let calls = 0;
    let fail: TraccarError | null = null;
    const traccar = {
      ping: async () => {
        calls++;
        if (fail) throw fail;
      },
    } as unknown as TraccarClient;
    const build = () =>
      buildApp({
        db: { execute: async () => ({ rows: [] }) } as unknown as Db,
        traccar,
        publicDir: '/nonexistent',
        sessionSecret: 'x'.repeat(32),
        secureCookies: false,
      });

    const ok = build();
    expect(await (await ok.request('/api/health/traccar')).json()).toEqual({ status: 'ok' });
    await ok.request('/api/health/traccar');
    expect(calls).toBe(1);

    fail = new TraccarError(400, '/devices', 'Traccar GET /devices returned 400');
    const res = await build().request('/api/health/traccar');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error', error: 'unauthorized' });

    fail = new TraccarError(0, '/devices', 'fetch failed');
    expect(await (await build().request('/api/health/traccar')).json()).toEqual({
      status: 'error',
      error: 'unreachable',
    });
  });

  it('serves the public instance config', async () => {
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientName: 'Bašta' });
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
    // Unhashed files (sw.js, the manifest) must be revalidated, or a deploy would not reach the app.
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('caches hashed build assets for good', async () => {
    const res = await app.request('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('falls back to index.html for client routes', async () => {
    const res = await app.request('/history');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>Trag · Bašta &#38; &#60;Co&#62;</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('puts the client title in index.html at every path, escaped', async () => {
    for (const path of ['/', '/index.html', '/history']) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<title>Trag · Bašta &#38; &#60;Co&#62;</title>');
    }
  });
});
