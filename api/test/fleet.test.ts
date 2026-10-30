import { describe, expect, it } from 'vitest';
import { toEvent, toRoutePoints, toStop, toTrip } from '../src/fleet/reports.js';
import { engineSeconds, toVehicle, toVehicles } from '../src/fleet/vehicles.js';
import type { Device, Position } from '../src/traccar/traccar.js';

const device = (over: Partial<Device> = {}): Device => ({
  id: 1,
  name: 'BG 1234-AB',
  status: 'online',
  lastUpdate: '2026-10-30T13:20:00Z',
  ...over,
});

const position = (over: Partial<Position> = {}): Position => ({
  id: 10,
  deviceId: 1,
  latitude: 44.8,
  longitude: 20.4,
  fixTime: '2026-10-30T13:20:00Z',
  valid: true,
  speed: 0,
  attributes: {},
  ...over,
});

describe('toVehicle', () => {
  it('is moving above the threshold, with speed in km/h', () => {
    const v = toVehicle(device(), position({ speed: 34.56, attributes: { ignition: true } }));
    expect(v.state).toBe('moving');
    expect(v.position).toMatchObject({ speedKmh: 64, ignition: true, lat: 44.8, lng: 20.4 });
  });

  it('is stopped when online and slow', () => {
    expect(toVehicle(device(), position({ speed: 1 })).state).toBe('stopped');
  });

  it('is offline whenever Traccar does not report online', () => {
    expect(toVehicle(device({ status: 'offline' }), position({ speed: 40 })).state).toBe('offline');
    expect(toVehicle(device({ status: 'unknown' }), undefined).state).toBe('offline');
  });

  it('reports unknown ignition as null and handles missing positions', () => {
    expect(toVehicle(device(), position()).position?.ignition).toBeNull();
    expect(toVehicle(device(), undefined).position).toBeNull();
  });

  it('joins positions by device, drops disabled devices and sorts by name', () => {
    const list = toVehicles(
      [
        device({ id: 2, name: 'NS 567-CD' }),
        device({ id: 1, name: 'BG 1234-AB' }),
        device({ id: 3, name: 'X', disabled: true }),
      ],
      [position({ deviceId: 2, latitude: 45.25 })],
    );
    expect(list.map((v) => v.id)).toEqual([1, 2]);
    expect(list[1]!.position?.lat).toBe(45.25);
    expect(list[0]!.position).toBeNull();
  });
});

describe('toRoutePoints', () => {
  it('drops invalid and 0,0 fixes and sorts by time', () => {
    const points = toRoutePoints([
      position({ id: 3, fixTime: '2026-10-30T10:02:00Z', speed: 10 }),
      position({ id: 1, fixTime: '2026-10-30T10:00:00Z' }),
      position({ id: 2, fixTime: '2026-10-30T10:01:00Z', valid: false }),
      position({ id: 4, fixTime: '2026-10-30T10:03:00Z', latitude: 0, longitude: 0 }),
    ]);
    expect(points.map((p) => p.time)).toEqual([
      '2026-10-30T10:00:00.000Z',
      '2026-10-30T10:02:00.000Z',
    ]);
    expect(points[1]!.speedKmh).toBe(18.5);
  });
});

describe('report mapping', () => {
  it('converts trip units', () => {
    const trip = toTrip({
      deviceId: 1,
      startTime: '2026-10-30T08:00:00Z',
      endTime: '2026-10-30T08:30:00Z',
      duration: 1_800_000,
      distance: 23_456,
      maxSpeed: 54,
      averageSpeed: 27,
      startLat: 44.8,
      startLon: 20.4,
    });
    expect(trip).toMatchObject({
      durationS: 1800,
      distanceKm: 23.46,
      maxSpeedKmh: 100,
      averageSpeedKmh: 50,
    });
    expect(trip.start).toEqual({ lat: 44.8, lng: 20.4, address: null });
  });

  it("reads Traccar's latitude/longitude on stops and normalizes times", () => {
    const stop = toStop({
      deviceId: 1,
      startTime: '2026-10-30T09:00:00.000+00:00',
      endTime: '2026-10-30T10:36:00.000+00:00',
      duration: 5_760_000,
      latitude: 44.9,
      longitude: 20.3,
      address: 'Inđija',
    });
    expect(stop).toMatchObject({
      startTime: '2026-10-30T09:00:00.000Z',
      durationS: 5760,
      lat: 44.9,
      lng: 20.3,
      address: 'Inđija',
    });
  });

  it('names vehicles and geofences on events', () => {
    const e = toEvent(
      {
        id: 5,
        type: 'geofenceEnter',
        eventTime: '2026-10-30T12:12:00Z',
        deviceId: 1,
        geofenceId: 9,
      },
      new Map([[1, 'BG 455-KL']]),
      new Map([[9, { id: 9, name: 'Klijent Petrović', area: 'CIRCLE (44.8 20.4, 100)' }]]),
    );
    expect(e).toMatchObject({
      vehicleName: 'BG 455-KL',
      geofenceName: 'Klijent Petrović',
      alarm: null,
    });
  });
});

describe('vehicle context', () => {
  it('names the locations a vehicle is in and reads the alarm', () => {
    const v = toVehicle(
      device({ model: 'Fiat Ducato' }),
      position({ geofenceIds: [9], attributes: { alarm: 'tow' } }),
      {
        geofences: new Map([
          [9, { id: 9, name: 'Klijent Petrović', area: 'CIRCLE (44.8 20.4, 100)' }],
        ]),
      },
    );
    expect(v).toMatchObject({
      model: 'Fiat Ducato',
      alarm: 'tow',
      locations: ['Klijent Petrović'],
    });
  });

  it('takes stoppedSince from the ongoing stop only', () => {
    const fixTime = '2026-10-30T10:30:00Z';
    const stops = [
      { deviceId: 1, startTime: '2026-10-30T08:00:00Z', endTime: '2026-10-30T09:00:00Z' },
      { deviceId: 1, startTime: '2026-10-30T09:45:00.000+00:00', endTime: '2026-10-30T10:29:30Z' },
      { deviceId: 2, startTime: '2026-10-30T10:00:00Z', endTime: '2026-10-30T10:30:00Z' },
    ];
    expect(toVehicle(device(), position({ fixTime }), { stops }).stoppedSince).toBe(
      '2026-10-30T09:45:00.000Z',
    );

    const finished = [
      { deviceId: 1, startTime: '2026-10-30T08:00:00Z', endTime: '2026-10-30T09:00:00Z' },
    ];
    expect(toVehicle(device(), position({ fixTime }), { stops: finished }).stoppedSince).toBeNull();
    expect(
      toVehicle(device(), position({ fixTime, speed: 30 }), { stops }).stoppedSince,
    ).toBeNull();
  });
});

describe('engineSeconds', () => {
  it('sums intervals that start with ignition on and skips long gaps', () => {
    const at = (time: string, ignition: boolean) =>
      position({ fixTime: `2026-10-30T${time}:00Z`, attributes: { ignition } });
    expect(
      engineSeconds([
        at('08:00', true),
        at('08:05', true),
        at('08:10', false),
        at('08:20', true),
        at('09:00', true), // 40 min gap: not counted
        at('09:02', false),
      ]),
    ).toBe((5 + 5 + 2) * 60);
  });
});
