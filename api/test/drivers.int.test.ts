import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { createDatabase, type Database } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';
import { driverAssignments, drivers, sessions, users } from '../src/db/schema.js';
import { assignDriver, assignmentsBetween, driverAt } from '../src/drivers/drivers.js';
import { FakeTraccar } from './fakeTraccar.js';

// Runs only against a disposable database (see auth.int.test.ts).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('drivers (integration)', () => {
  let database: Database;
  let traccar: FakeTraccar;
  let app: ReturnType<typeof buildApp>;
  let ownerCookie: string;
  let viewerCookie: string;

  async function loginAs(email: string) {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.2.0.${email.length}` },
      body: JSON.stringify({ email, password: 'secret-password' }),
    });
    return res.headers.get('set-cookie')!.split(';')[0]!;
  }

  function call(method: string, path: string, body?: unknown, cookie = ownerCookie) {
    return app.request(`/api${path}`, {
      method,
      headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async function newDriver(name: string, phone?: string) {
    const res = await call('POST', '/drivers', { name, phone });
    expect(res.status).toBe(201);
    return ((await res.json()) as { driver: { id: number } }).driver.id;
  }

  const history = (deviceId: number) =>
    database.db
      .select()
      .from(driverAssignments)
      .where(eq(driverAssignments.deviceId, deviceId))
      .orderBy(driverAssignments.startedAt);

  beforeAll(async () => {
    database = createDatabase(url!);
    const { db } = database;
    await migrate(database);
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
    await database.db.delete(driverAssignments);
    await database.db.delete(drivers);
    traccar.trips = [];
  });

  afterAll(async () => {
    await database?.pool.end();
  });

  it('creates drivers and assigns one to a vehicle', async () => {
    const marko = await newDriver('Marko S.', '+381 62 123 4567');
    expect((await call('PUT', '/vehicles/1/driver', { driver_id: marko })).status).toBe(204);

    const { drivers: list } = (await (await call('GET', '/drivers')).json()) as {
      drivers: { name: string; vehicleId: number | null }[];
    };
    expect(list).toEqual([expect.objectContaining({ name: 'Marko S.', vehicleId: 1 })]);

    const { vehicles } = (await (await call('GET', '/vehicles')).json()) as {
      vehicles: { id: number; driver: { name: string; phone: string } | null }[];
    };
    expect(vehicles.find((v) => v.id === 1)?.driver).toMatchObject({
      name: 'Marko S.',
      phone: '+381 62 123 4567',
    });
    expect(vehicles.find((v) => v.id === 2)?.driver).toBeNull();
  });

  it('keeps history when the driver changes, and moves a driver between vehicles', async () => {
    const marko = await newDriver('Marko');
    const ana = await newDriver('Ana');
    const t0 = new Date('2026-10-30T06:00:00Z');
    const t1 = new Date('2026-10-30T10:00:00Z');
    const t2 = new Date('2026-10-30T12:00:00Z');

    await assignDriver(database.db, 1, marko, t0);
    await assignDriver(database.db, 1, ana, t1); // Ana takes vehicle 1
    await assignDriver(database.db, 2, ana, t2); // Ana moves to vehicle 2; vehicle 1 is left empty

    const v1 = await history(1);
    expect(
      v1.map((a) => [a.driverId, a.startedAt.toISOString(), a.endedAt?.toISOString() ?? null]),
    ).toEqual([
      [marko, t0.toISOString(), t1.toISOString()],
      [ana, t1.toISOString(), t2.toISOString()],
    ]);
    expect((await history(2)).map((a) => [a.driverId, a.endedAt])).toEqual([[ana, null]]);

    const periods = await assignmentsBetween(
      database.db,
      [1, 2],
      t0,
      new Date('2026-10-30T23:00:00Z'),
    );
    expect(driverAt(periods, 1, new Date('2026-10-30T08:00:00Z'))?.name).toBe('Marko');
    expect(driverAt(periods, 1, new Date('2026-10-30T11:00:00Z'))?.name).toBe('Ana');
    expect(driverAt(periods, 1, new Date('2026-10-30T13:00:00Z'))).toBeNull();
    expect(driverAt(periods, 2, new Date('2026-10-30T13:00:00Z'))?.name).toBe('Ana');
  });

  it('attributes trips to the driver assigned when they started', async () => {
    const marko = await newDriver('Marko');
    await assignDriver(database.db, 1, marko, new Date('2026-10-30T06:00:00Z'));
    traccar.trips = [
      {
        deviceId: 1,
        startTime: '2026-10-30T05:00:00.000+00:00',
        endTime: '2026-10-30T05:30:00.000+00:00',
      },
      {
        deviceId: 1,
        startTime: '2026-10-30T07:00:00.000+00:00',
        endTime: '2026-10-30T07:30:00.000+00:00',
      },
    ];
    const res = await call('GET', '/vehicles/1/trips?from=2026-10-30&to=2026-10-30');
    const { trips } = (await res.json()) as { trips: { driver: { name: string } | null }[] };
    expect(trips.map((t) => t.driver?.name ?? null)).toEqual([null, 'Marko']);
  });

  it('unassigns, and deactivating a driver ends their assignment', async () => {
    const marko = await newDriver('Marko');
    const ana = await newDriver('Ana');
    await call('PUT', '/vehicles/1/driver', { driver_id: marko });
    await call('PUT', '/vehicles/2/driver', { driver_id: ana });

    expect((await call('PUT', '/vehicles/1/driver', { driver_id: null })).status).toBe(204);
    expect((await history(1)).every((a) => a.endedAt !== null)).toBe(true);

    const res = await call('PUT', `/drivers/${ana}`, { active: false });
    expect(((await res.json()) as { driver: unknown }).driver).toMatchObject({
      active: false,
      vehicleId: null,
    });
    expect((await history(2)).every((a) => a.endedAt !== null)).toBe(true);

    const again = await call('PUT', '/vehicles/2/driver', { driver_id: ana });
    expect(again.status).toBe(409);
  });

  it('deletes a driver who never drove, keeps one with history', async () => {
    const marko = await newDriver('Marko');
    const ana = await newDriver('Ana');
    await call('PUT', '/vehicles/1/driver', { driver_id: ana });
    await call('PUT', '/vehicles/1/driver', { driver_id: null });

    expect((await call('DELETE', `/drivers/${marko}`, undefined, viewerCookie)).status).toBe(403);
    expect((await call('DELETE', `/drivers/${marko}`)).status).toBe(204);
    expect((await call('DELETE', `/drivers/${marko}`)).status).toBe(404);

    expect((await call('DELETE', `/drivers/${ana}`)).status).toBe(409);
    const { drivers: list } = (await (await call('GET', '/drivers')).json()) as {
      drivers: { name: string }[];
    };
    expect(list.map((d) => d.name)).toEqual(['Ana']);
  });

  it('serializes concurrent assignments to the same vehicle', async () => {
    const ids = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((n) => newDriver(n)));
    const results = await Promise.all(
      ids.map((id) => call('PUT', '/vehicles/1/driver', { driver_id: id })),
    );
    expect(results.map((r) => r.status)).toEqual([204, 204, 204, 204, 204]);

    const rows = await history(1);
    expect(rows.filter((a) => a.endedAt === null)).toHaveLength(1);
    // Each assignment starts where the previous one ended: no gaps, no overlaps.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.startedAt.getTime()).toBeGreaterThanOrEqual(rows[i - 1]!.endedAt!.getTime());
    }
  });

  it('validates input and permissions', async () => {
    expect((await call('PUT', '/vehicles/99/driver', { driver_id: null })).status).toBe(404);
    expect((await call('PUT', '/vehicles/1/driver', { driver_id: 12345 })).status).toBe(404);
    expect((await call('POST', '/drivers', { name: '  ' })).status).toBe(400);
    expect((await call('GET', '/drivers', undefined, viewerCookie)).status).toBe(200);
    expect((await call('POST', '/drivers', { name: 'X' }, viewerCookie)).status).toBe(403);
    expect(
      (await call('PUT', '/vehicles/1/driver', { driver_id: null }, viewerCookie)).status,
    ).toBe(403);
  });
});
