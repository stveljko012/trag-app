import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client.js';

const startedAt = Date.now();

export function healthRoutes(db: Db) {
  return new Hono().get('/', async (c) => {
    const uptime_s = Math.round((Date.now() - startedAt) / 1000);
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: 'ok', uptime_s });
    } catch {
      return c.json({ status: 'error', uptime_s, error: 'Database unavailable' }, 503);
    }
  });
}
