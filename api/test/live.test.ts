import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client.js';
import { LiveHub } from '../src/fleet/liveHub.js';
import { MapContext } from '../src/fleet/mapContext.js';
import type { VehicleDto } from '../src/fleet/vehicles.js';
import { liveRoutes, webhookRoutes } from '../src/routes/live.js';
import type { TraccarClient } from '../src/traccar/traccar.js';

const SECRET = 's'.repeat(32);

function fakeTraccar(overrides: Partial<Record<keyof TraccarClient, unknown>> = {}) {
  const calls = { geofences: 0, stops: 0 };
  const traccar = {
    getGeofences: async () => {
      calls.geofences++;
      return [{ id: 7, name: 'Magacin', area: 'CIRCLE (44.8 20.4, 100)' }];
    },
    getStops: async () => {
      calls.stops++;
      return [];
    },
    ...overrides,
  } as unknown as TraccarClient;
  return { traccar, calls };
}

// currentDrivers() runs a select with a join; this stub answers it with no rows.
const db = {
  select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => [] }) }) }),
} as unknown as Db;

function webhookApp(secret: string | undefined, hub = new LiveHub()) {
  const { traccar } = fakeTraccar();
  return new Hono().route('/webhooks', webhookRoutes(secret, hub, new MapContext(traccar, db)));
}

function forward(fixTime: string, device: object | null = { id: 1, name: 'BG 1234-AB' }) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': SECRET },
    body: JSON.stringify({
      device: device && { status: 'online', ...device },
      position: {
        id: 1,
        deviceId: 1,
        latitude: 44.8,
        longitude: 20.4,
        speed: 20,
        course: 90,
        fixTime,
        geofenceIds: [7],
        attributes: { ignition: true },
      },
    }),
  };
}

describe('position webhook', () => {
  it('does not exist without a secret', async () => {
    const res = await webhookApp(undefined).request('/webhooks/traccar/position', forward('x'));
    expect(res.status).toBe(404);
  });

  it('rejects a wrong secret', async () => {
    const init = forward('2026-10-31T10:00:00.000+00:00');
    const res = await webhookApp(SECRET).request('/webhooks/traccar/position', {
      ...init,
      headers: { ...init.headers, 'X-Webhook-Secret': 'wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('publishes newer positions as vehicles and skips older ones', async () => {
    const hub = new LiveHub();
    const sent: VehicleDto[] = [];
    hub.subscribe(
      (v) => sent.push(v),
      () => {},
    );
    const app = webhookApp(SECRET, hub);
    const post = (init: RequestInit) => app.request('/webhooks/traccar/position', init);

    expect((await post(forward('2026-10-31T10:00:10.000+00:00'))).status).toBe(204);
    // A buffered position from before the last one, then a repeat of it: neither is sent.
    await post(forward('2026-10-31T10:00:00.000+00:00'));
    await post(forward('2026-10-31T10:00:10.000+00:00'));
    await post(forward('2026-10-31T10:00:20.000+00:00'));

    expect(sent.map((v) => v.position?.fixTime)).toEqual([
      '2026-10-31T10:00:10.000Z',
      '2026-10-31T10:00:20.000Z',
    ]);
    expect(sent[0]).toMatchObject({
      id: 1,
      name: 'BG 1234-AB',
      state: 'moving',
      locations: ['Magacin'],
      position: { lat: 44.8, lng: 20.4, ignition: true },
    });
  });

  it('acknowledges but skips positions without a device or with bad input', async () => {
    const hub = new LiveHub();
    const sent: VehicleDto[] = [];
    hub.subscribe(
      (v) => sent.push(v),
      () => {},
    );
    const app = webhookApp(SECRET, hub);
    const noDevice = await app.request(
      '/webhooks/traccar/position',
      forward('2026-10-31T10:00:00.000Z', null),
    );
    const badTime = await app.request('/webhooks/traccar/position', forward('not a time'));
    expect([noDevice.status, badTime.status]).toEqual([204, 204]);
    expect(sent).toEqual([]);
  });
});

describe('live stream', () => {
  it('sends published vehicles and ends when the hub closes', async () => {
    const hub = new LiveHub();
    const app = new Hono().route('/live', liveRoutes(hub, true));
    const res = await app.request('/live');
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('Content-Encoding')).toBe('identity');

    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const ready = (await reader.read()).value!;
    expect(ready).toContain('event: ready');
    expect(ready).toContain('data: {"webhook":true}');
    expect(hub.size).toBe(1);

    hub.publish({ id: 1, name: 'BG 1234-AB' } as VehicleDto);
    const event = (await reader.read()).value!;
    expect(event).toContain('event: vehicle');
    expect(event).toContain('"name":"BG 1234-AB"');

    hub.close();
    while (!(await reader.read()).done);
    expect(hub.size).toBe(0);
  });
});

describe('map context', () => {
  it('reuses loads within the TTL and reloads after invalidation or expiry', async () => {
    let now = 0;
    const { traccar, calls } = fakeTraccar();
    const context = new MapContext(traccar, db, { ttlMs: 1000, now: () => now });

    await Promise.all([context.get([1, 2]), context.get([1, 2])]);
    expect(calls).toEqual({ geofences: 1, stops: 1 });

    now = 500;
    expect((await context.get()).geofences?.get(7)?.name).toBe('Magacin');
    expect(calls).toEqual({ geofences: 1, stops: 1 });

    context.invalidateGeofences();
    await context.get();
    expect(calls.geofences).toBe(2);

    // A new device reloads the stops so they cover it.
    await context.get([1, 2, 3]);
    expect(calls.stops).toBe(2);

    now = 2000;
    await context.get();
    expect(calls).toEqual({ geofences: 3, stops: 3 });
  });

  it('does not cache a failed load', async () => {
    let fail = true;
    const { traccar } = fakeTraccar({
      getGeofences: async () => {
        if (fail) throw new Error('down');
        return [];
      },
    });
    const context = new MapContext(traccar, db);
    await expect(context.get()).rejects.toThrow('down');
    fail = false;
    await expect(context.get()).resolves.toMatchObject({ geofences: new Map() });
  });
});
