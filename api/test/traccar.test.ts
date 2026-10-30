import { describe, expect, it, vi } from 'vitest';
import { TraccarClient, TraccarError } from '../src/traccar/traccar.js';

function fakeFetch(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('TraccarClient', () => {
  it('sends Bearer auth and Accept: application/json', async () => {
    const fetch = fakeFetch(json([]));
    const client = new TraccarClient({ url: 'http://traccar:8082/api/', token: 'tok', fetch });
    await client.getDevices();

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('http://traccar:8082/api/devices');
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers.Accept).toBe('application/json');
  });

  it('falls back to Basic auth', async () => {
    const fetch = fakeFetch(json([]));
    const client = new TraccarClient({ url: 'http://t/api', user: 'svc', pass: 'p@ss', fetch });
    await client.getGeofences();
    const headers = fetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('svc:p@ss').toString('base64')}`);
  });

  it('requires some form of auth', () => {
    expect(() => new TraccarClient({ url: 'http://t/api' })).toThrow(/TRACCAR_TOKEN/);
  });

  it('repeats deviceId for multi-device reports and sends ISO dates', async () => {
    const fetch = fakeFetch(json([]));
    const client = new TraccarClient({ url: 'http://t/api', token: 'x', fetch });
    const from = new Date('2026-10-29T23:00:00Z');
    const to = new Date('2026-10-30T22:59:59.999Z');
    await client.getEvents([1, 2], from, to, ['geofenceEnter']);

    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/reports/events');
    expect(url.searchParams.getAll('deviceId')).toEqual(['1', '2']);
    expect(url.searchParams.get('from')).toBe('2026-10-29T23:00:00.000Z');
    expect(url.searchParams.get('to')).toBe('2026-10-30T22:59:59.999Z');
    expect(url.searchParams.getAll('type')).toEqual(['geofenceEnter']);
  });

  it('skips report calls when there are no devices', async () => {
    const fetch = fakeFetch(json([]));
    const client = new TraccarClient({ url: 'http://t/api', token: 'x', fetch });
    expect(await client.getTrips([], new Date(0), new Date(1))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends JSON bodies for geofence writes', async () => {
    const fetch = fakeFetch(json({ id: 7, name: 'A', area: 'CIRCLE (44.8 20.4, 100)' }));
    const client = new TraccarClient({ url: 'http://t/api', token: 'x', fetch });
    const created = await client.createGeofence({ name: 'A', area: 'CIRCLE (44.8 20.4, 100)' });
    expect(created.id).toBe(7);
    const init = fetch.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'A', area: 'CIRCLE (44.8 20.4, 100)' });
  });

  it('handles 204 on delete', async () => {
    const fetch = fakeFetch(new Response(null, { status: 204 }));
    const client = new TraccarClient({ url: 'http://t/api', token: 'x', fetch });
    await expect(client.deleteGeofence(7)).resolves.toBeUndefined();
    expect(String(fetch.mock.calls[0]![0])).toBe('http://t/api/geofences/7');
  });

  it('throws TraccarError with the status on non-2xx', async () => {
    const client = new TraccarClient({
      url: 'http://t/api',
      token: 'x',
      fetch: fakeFetch(new Response('Unauthorized', { status: 401 })),
    });
    const err = await client.getDevices().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TraccarError);
    expect((err as TraccarError).status).toBe(401);
    expect((err as TraccarError).path).toBe('/devices');
  });

  it('throws TraccarError with status 0 on network failure', async () => {
    const client = new TraccarClient({
      url: 'http://t/api',
      token: 'x',
      fetch: fakeFetch(new TypeError('fetch failed')),
    });
    const err = await client.getDevices().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TraccarError);
    expect((err as TraccarError).status).toBe(0);
  });
});
