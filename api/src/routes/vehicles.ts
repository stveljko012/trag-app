import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { toRoutePoints, toStop, toTrip } from '../fleet/reports.js';
import type { Db } from '../db/client.js';
import { assignmentsBetween, assignDriver, currentDrivers, driverAt } from '../drivers/drivers.js';
import { engineSeconds, toVehicles } from '../fleet/vehicles.js';
import { belgradeDay, belgradeDayRange } from '../time/belgrade.js';
import type { Stop, TraccarClient } from '../traccar/traccar.js';
import { metersToKm, round } from '../traccar/units.js';
import { requireOwner } from '../auth/middleware.js';
import type { AppEnv } from '../types.js';
import { zValidator } from '../validation.js';
import { daySchema, idParamSchema, rangeQuery } from './params.js';

const MAX_REPORT_DAYS = 31;
// Stops of the last day, used for "stopped for N min". Refreshed at most this often, so the
// 10-second map polling doesn't run a Traccar report each time.
const STOPS_CACHE_MS = 60_000;
const STOPS_WINDOW_MS = 24 * 60 * 60 * 1000;

export function vehiclesRoutes(traccar: TraccarClient, db: Db) {
  let stopsCache: { at: number; stops: Stop[] } | undefined;

  async function recentStops(deviceIds: number[]): Promise<Stop[] | undefined> {
    if (stopsCache && Date.now() - stopsCache.at < STOPS_CACHE_MS) return stopsCache.stops;
    try {
      const now = new Date();
      const stops = await traccar.getStops(
        deviceIds,
        new Date(now.getTime() - STOPS_WINDOW_MS),
        now,
      );
      stopsCache = { at: Date.now(), stops };
      return stops;
    } catch (err) {
      // Nice to have; the map must still load without it.
      console.error('Loading recent stops failed', err);
      return stopsCache?.stops;
    }
  }

  async function assertVehicle(id: number) {
    const devices = await traccar.getDevices();
    if (!devices.some((d) => d.id === id && !d.disabled)) {
      throw new HTTPException(404, { message: 'Vozilo nije pronađeno' });
    }
  }

  return new Hono<AppEnv>()
    .get('/', async (c) => {
      const [devices, positions, geofences] = await Promise.all([
        traccar.getDevices(),
        traccar.getLatestPositions(),
        traccar.getGeofences(),
      ]);
      const [stops, drivers] = await Promise.all([
        recentStops(devices.map((d) => d.id)),
        currentDrivers(db),
      ]);
      return c.json({
        vehicles: toVehicles(devices, positions, {
          geofences: new Map(geofences.map((g) => [g.id, g])),
          stops,
          drivers,
        }),
      });
    })
    .get('/:id/today', zValidator('param', idParamSchema), async (c) => {
      const { id } = c.req.valid('param');
      await assertVehicle(id);
      const from = belgradeDayRange(belgradeDay()).from;
      const to = new Date();
      const [summary, positions] = await Promise.all([
        traccar.getSummary([id], from, to),
        traccar.getPositions(id, from, to),
      ]);
      return c.json({
        distanceKm: round(metersToKm(summary[0]?.distance ?? 0), 1),
        engineS: engineSeconds(positions),
      });
    })
    .get(
      '/:id/route',
      zValidator('param', idParamSchema),
      zValidator('query', z.object({ day: daySchema })),
      async (c) => {
        const { id } = c.req.valid('param');
        const { day } = c.req.valid('query');
        await assertVehicle(id);
        const { from, to } = belgradeDayRange(day);
        const positions = await traccar.getPositions(id, from, to);
        return c.json({ vehicleId: id, day, points: toRoutePoints(positions) });
      },
    )
    .get(
      '/:id/trips',
      zValidator('param', idParamSchema),
      zValidator('query', rangeQuery(MAX_REPORT_DAYS, {})),
      async (c) => {
        const { id } = c.req.valid('param');
        const { from, to } = c.req.valid('query');
        await assertVehicle(id);
        const [trips, periods] = await Promise.all([
          traccar.getTrips([id], from, to),
          assignmentsBetween(db, [id], from, to),
        ]);
        return c.json({
          trips: trips.map((t) => toTrip(t, driverAt(periods, id, new Date(t.startTime)))),
        });
      },
    )
    .get(
      '/:id/stops',
      zValidator('param', idParamSchema),
      zValidator('query', rangeQuery(MAX_REPORT_DAYS, {})),
      async (c) => {
        const { id } = c.req.valid('param');
        const { from, to } = c.req.valid('query');
        await assertVehicle(id);
        const stops = await traccar.getStops([id], from, to);
        return c.json({ stops: stops.map(toStop) });
      },
    )
    .put(
      '/:id/driver',
      requireOwner,
      zValidator('param', idParamSchema),
      zValidator('json', z.object({ driver_id: z.number().int().positive().nullable() })),
      async (c) => {
        const { id } = c.req.valid('param');
        await assertVehicle(id);
        await assignDriver(db, id, c.req.valid('json').driver_id);
        return c.body(null, 204);
      },
    );
}
