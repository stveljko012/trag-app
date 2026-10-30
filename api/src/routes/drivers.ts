import { Hono } from 'hono';
import { z } from 'zod';
import { requireOwner } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { createDriver, deleteDriver, listDrivers, updateDriver } from '../drivers/drivers.js';
import type { AppEnv } from '../types.js';
import { zValidator } from '../validation.js';
import { idParamSchema } from './params.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));

const fields = {
  name: z.string().trim().min(1).max(100),
  phone: optionalText(40),
  notes: optionalText(2000),
};

export function driversRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get('/', async (c) => c.json({ drivers: await listDrivers(db) }))
    .post('/', requireOwner, zValidator('json', z.object(fields)), async (c) => {
      return c.json({ driver: await createDriver(db, c.req.valid('json')) }, 201);
    })
    .put(
      '/:id',
      requireOwner,
      zValidator('param', idParamSchema),
      zValidator(
        'json',
        z.object({ ...fields, name: fields.name.optional(), active: z.boolean().optional() }),
      ),
      async (c) => {
        const { id } = c.req.valid('param');
        return c.json({ driver: await updateDriver(db, id, c.req.valid('json')) });
      },
    )
    .delete('/:id', requireOwner, zValidator('param', idParamSchema), async (c) => {
      await deleteDriver(db, c.req.valid('param').id);
      return c.body(null, 204);
    });
}
