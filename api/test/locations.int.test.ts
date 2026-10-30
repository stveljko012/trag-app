import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { migrate } from '../src/db/migrate.js';
import { eq } from 'drizzle-orm';
import { createDatabase, type Database } from '../src/db/client.js';
import { locations, sessions, users } from '../src/db/schema.js';
import { FakeTraccar } from './fakeTraccar.js';

// Runs only against a disposable database (see auth.int.test.ts).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('locations (integration)', () => {
  let database: Database;
  let traccar: FakeTraccar;
  let app: ReturnType<typeof buildApp>;
  let ownerCookie: string;
  let viewerCookie: string;

  async function loginAs(email: string) {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${email.length}` },
      body: JSON.stringify({ email, password: 'secret-password' }),
    });
    return res.headers.get('set-cookie')!.split(';')[0]!;
  }

  function call(method: string, path: string, body?: unknown, cookie = ownerCookie) {
    return app.request(`/api/locations${path}`, {
      method,
      headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  beforeAll(async () => {
    database = createDatabase(url!);
    const { db } = database;
    await migrate(database);
    await db.delete(locations);
    await db.delete(sessions);
    await db.delete(users);
    const passwordHash = await hashPassword('secret-password');
    await db.insert(users).values([
      { email: 'owner@example.com', passwordHash, name: 'Owner', role: 'owner' },
      { email: 'viewer@example.com', passwordHash, name: 'Viewer', role: 'viewer' },
    ]);
    traccar = new FakeTraccar();
    app = buildApp({
      db,
      traccar: traccar.asClient(),
      publicDir: '/nonexistent',
      sessionSecret: 's'.repeat(32),
      secureCookies: false,
    });
    ownerCookie = await loginAs('owner@example.com');
    viewerCookie = await loginAs('viewer@example.com');
  });

  beforeEach(async () => {
    await database.db.delete(locations);
    traccar.geofences.clear();
    traccar.links = [];
    traccar.failLinks = false;
  });

  afterAll(async () => {
    await database?.pool.end();
  });

  it('creates a circle geofence linked to every device, plus our row', async () => {
    const res = await call('POST', '', {
      name: 'Market Lazić',
      lat: 44.87,
      lng: 20.64,
      radius_m: 150,
      notes: 'Ulaz iz dvorišta',
      hourly_rate: 1500,
    });
    expect(res.status).toBe(201);
    const { location } = (await res.json()) as { location: Record<string, unknown> };
    expect(location).toMatchObject({
      name: 'Market Lazić',
      notes: 'Ulaz iz dvorišta',
      hourlyRate: 1500,
      shape: { type: 'circle', lat: 44.87, lng: 20.64, radiusM: 150 },
    });
    const geofence = traccar.geofences.get(location.geofenceId as number)!;
    expect(geofence.area).toBe('CIRCLE (44.87 20.64, 150)');
    expect(traccar.links.map((l) => l.deviceId).sort()).toEqual([1, 2]);
  });

  it('defaults the radius to 100 m when created from a stop', async () => {
    const res = await call('POST', '/from-stop', { name: 'Stajanje', lat: 45.048, lng: 20.081 });
    expect(res.status).toBe(201);
    const { location } = (await res.json()) as { location: { shape: { radiusM: number } } };
    expect(location.shape.radiusM).toBe(100);
  });

  it('rolls back the geofence when linking fails', async () => {
    traccar.failLinks = true;
    const res = await call('POST', '', { name: 'X', lat: 44, lng: 20, radius_m: 100 });
    expect(res.status).toBe(502);
    expect(traccar.geofences.size).toBe(0);
    expect(await database.db.$count(locations)).toBe(0);
  });

  it('lists geofences made directly in Traccar and hides rows whose geofence is gone', async () => {
    await traccar.createGeofence({
      name: 'Iz Traccara',
      area: 'POLYGON ((44 20, 44.1 20, 44.1 20.1, 44 20))',
    });
    await database.db.insert(locations).values({ traccarGeofenceId: 9999, name: 'Obrisana' });
    const res = await call('GET', '');
    const { locations: listed } = (await res.json()) as {
      locations: { name: string; shape: { type: string } }[];
    };
    expect(listed.map((l) => l.name)).toEqual(['Iz Traccara']);
    expect(listed[0]!.shape.type).toBe('polygon');
  });

  it('updates name, circle and details, and keeps fields that are not sent', async () => {
    const created = (await (
      await call('POST', '', {
        name: 'A',
        lat: 44,
        lng: 20,
        radius_m: 100,
        notes: 'n',
        hourly_rate: 10,
      })
    ).json()) as { location: { id: number; geofenceId: number } };
    const id = created.location.id;

    let res = await call('PUT', `/${id}`, { name: 'B', lat: 44.5, lng: 20.5, radius_m: 250 });
    expect(res.status).toBe(200);
    expect(traccar.geofences.get(created.location.geofenceId)).toMatchObject({
      name: 'B',
      area: 'CIRCLE (44.5 20.5, 250)',
    });
    expect((await res.json()) as unknown).toMatchObject({
      location: { name: 'B', notes: 'n', hourlyRate: 10 },
    });

    res = await call('PUT', `/${id}`, { notes: null, hourly_rate: null });
    expect((await res.json()) as unknown).toMatchObject({
      location: { name: 'B', notes: null, hourlyRate: null, shape: { radiusM: 250 } },
    });
  });

  it('requires lat, lng and radius together', async () => {
    const res = await call('PUT', '/1', { radius_m: 300 });
    expect(res.status).toBe(400);
  });

  it('refuses to turn a non-circle into a circle', async () => {
    const g = await traccar.createGeofence({
      name: 'Poly',
      area: 'POLYGON ((44 20, 44.1 20, 44.1 20.1, 44 20))',
    });
    await call('GET', '');
    const [row] = await database.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.traccarGeofenceId, g.id));
    const res = await call('PUT', `/${row!.id}`, { lat: 44, lng: 20, radius_m: 100 });
    expect(res.status).toBe(409);
  });

  it('deletes from Traccar and our table', async () => {
    const created = (await (
      await call('POST', '', { name: 'A', lat: 44, lng: 20, radius_m: 100 })
    ).json()) as {
      location: { id: number; geofenceId: number };
    };
    expect((await call('DELETE', `/${created.location.id}`)).status).toBe(204);
    expect(traccar.geofences.has(created.location.geofenceId)).toBe(false);
    expect((await call('DELETE', `/${created.location.id}`)).status).toBe(404);
  });

  it('lets viewers read but not write', async () => {
    expect((await call('GET', '', undefined, viewerCookie)).status).toBe(200);
    const res = await call(
      'POST',
      '',
      { name: 'A', lat: 44, lng: 20, radius_m: 100 },
      viewerCookie,
    );
    expect(res.status).toBe(403);
    expect(traccar.geofences.size).toBe(0);
  });
});
