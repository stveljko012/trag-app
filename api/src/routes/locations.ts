import { Hono } from 'hono';
import { z } from 'zod';
import { requireOwner } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import type { MapContext } from '../fleet/mapContext.js';
import {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
} from '../locations/locations.js';
import type { TraccarClient } from '../traccar/traccar.js';
import type { AppEnv } from '../types.js';
import { zValidator } from '../validation.js';
import { idParamSchema } from './params.js';

export const DEFAULT_STOP_RADIUS_M = 100;

const name = z.string().trim().min(1).max(100);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const radius = z.number().min(10).max(5000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));
const details = {
  address: optionalText(300),
  notes: optionalText(2000),
  hourly_rate: z.number().min(0).max(10_000_000).nullish(),
};

const createSchema = z.object({ name, lat, lng, radius_m: radius, ...details });
const fromStopSchema = z.object({
  name,
  lat,
  lng,
  radius_m: radius.default(DEFAULT_STOP_RADIUS_M),
  ...details,
});
const updateSchema = z
  .object({
    name: name.optional(),
    lat: lat.optional(),
    lng: lng.optional(),
    radius_m: radius.optional(),
    ...details,
  })
  .refine(
    (v) =>
      [v.lat, v.lng, v.radius_m].every((x) => x === undefined) ||
      [v.lat, v.lng, v.radius_m].every((x) => x !== undefined),
    { message: 'lat, lng i radius_m se šalju zajedno' },
  );

type CreateBody = z.infer<typeof createSchema>;

function toCreateInput(body: CreateBody) {
  return {
    name: body.name,
    lat: body.lat,
    lng: body.lng,
    radiusM: body.radius_m,
    address: body.address,
    notes: body.notes,
    hourlyRate: body.hourly_rate,
  };
}

export function locationsRoutes(db: Db, traccar: TraccarClient, mapContext: MapContext) {
  return (
    new Hono<AppEnv>()
      // Every change reaches the map's location names right away, not after the cache expires.
      .use('*', async (c, next) => {
        await next();
        if (c.req.method !== 'GET' && c.res.ok) mapContext.invalidateGeofences();
      })
      .get('/', async (c) => c.json({ locations: await listLocations(db, traccar) }))
      .post('/', requireOwner, zValidator('json', createSchema), async (c) => {
        const location = await createLocation(db, traccar, toCreateInput(c.req.valid('json')));
        return c.json({ location }, 201);
      })
      .post('/from-stop', requireOwner, zValidator('json', fromStopSchema), async (c) => {
        const location = await createLocation(db, traccar, toCreateInput(c.req.valid('json')));
        return c.json({ location }, 201);
      })
      .put(
        '/:id',
        requireOwner,
        zValidator('param', idParamSchema),
        zValidator('json', updateSchema),
        async (c) => {
          const { id } = c.req.valid('param');
          const body = c.req.valid('json');
          const location = await updateLocation(db, traccar, id, {
            name: body.name,
            circle:
              body.lat !== undefined && body.lng !== undefined && body.radius_m !== undefined
                ? { lat: body.lat, lng: body.lng, radiusM: body.radius_m }
                : undefined,
            address: body.address,
            notes: body.notes,
            hourlyRate: body.hourly_rate,
          });
          return c.json({ location });
        },
      )
      .delete('/:id', requireOwner, zValidator('param', idParamSchema), async (c) => {
        await deleteLocation(db, traccar, c.req.valid('param').id);
        return c.body(null, 204);
      })
  );
}
