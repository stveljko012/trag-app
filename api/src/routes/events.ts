import { Hono } from 'hono';
import { z } from 'zod';
import { toEvent } from '../fleet/reports.js';
import type { TraccarClient } from '../traccar/traccar.js';
import type { AppEnv } from '../types.js';
import { zValidator } from '../validation.js';
import { rangeQuery } from './params.js';

const MAX_EVENT_DAYS = 31;

const eventsQuery = rangeQuery(MAX_EVENT_DAYS, {
  type: z
    .string()
    .regex(/^[A-Za-z]+$/)
    .optional(),
  vehicle: z.coerce.number().int().positive().optional(),
});

export function eventsRoutes(traccar: TraccarClient) {
  return new Hono<AppEnv>().get('/', zValidator('query', eventsQuery), async (c) => {
    const { from, to, type, vehicle } = c.req.valid('query');
    const [devices, geofences] = await Promise.all([traccar.getDevices(), traccar.getGeofences()]);
    const deviceIds = devices
      .map((d) => d.id)
      .filter((id) => vehicle === undefined || id === vehicle);
    const events = await traccar.getEvents(deviceIds, from, to, type ? [type] : undefined);

    const deviceNames = new Map(devices.map((d) => [d.id, d.name]));
    const geofencesById = new Map(geofences.map((g) => [g.id, g]));
    return c.json({
      events: events
        .map((e) => toEvent(e, deviceNames, geofencesById))
        .sort((a, b) => b.time.localeCompare(a.time)),
    });
  });
}
