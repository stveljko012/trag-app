import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { toRoutePoints, toStop, toTrip } from '../fleet/reports.js';
import type { Db } from '../db/client.js';
import { assignmentsBetween, assignDriver, currentDrivers, driverAt } from '../drivers/drivers.js';
import type { MapContext } from '../fleet/mapContext.js';
import { engineSeconds, toVehicles } from '../fleet/vehicles.js';
import { belgradeDay, belgradeDayRange } from '../time/belgrade.js';
import type { TraccarClient } from '../traccar/traccar.js';
import { metersToKm, round } from '../traccar/units.js';
import { requireOwner } from '../auth/middleware.js';
import type { AppEnv } from '../types.js';
import { zValidator } from '../validation.js';
import { daySchema, idParamSchema, rangeQuery } from './params.js';

const MAX_REPORT_DAYS = 31;

export function vehiclesRoutes(traccar: TraccarClient, db: Db, mapContext: MapContext) {
  async function assertVehicle(id: number) {
    const devices = await traccar.getDevices();
    if (!devices.some((d) => d.id === id && !d.disabled)) {
      throw new HTTPException(404, { message: 'Vozilo nije pronađeno' });
    }
  }

  return (
    new Hono<AppEnv>()
      // Names and current drivers for selects (history, events, drivers); always fresh, no cache.
      .get('/options', async (c) => {
        const [devices, drivers] = await Promise.all([traccar.getDevices(), currentDrivers(db)]);
        return c.json({
          vehicles: devices
            .filter((d) => !d.disabled)
            .map((d) => ({ id: d.id, name: d.name, driver: drivers.get(d.id) ?? null }))
            .sort((a, b) => a.name.localeCompare(b.name, 'sr')),
        });
      })
      .get('/', async (c) => {
        // The live map: devices and positions fresh from Traccar, the rest from the map's cache.
        const [devices, positions] = await Promise.all([
          traccar.getDevices(),
          traccar.getLatestPositions(),
        ]);
        const context = await mapContext.get(devices.map((d) => d.id));
        return c.json({ vehicles: toVehicles(devices, positions, context) });
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
          mapContext.invalidateDrivers();
          return c.body(null, 204);
        },
      )
  );
}
