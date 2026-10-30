import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client.js';
import { type TraccarClient, TraccarError } from '../traccar/traccar.js';

const startedAt = Date.now();

// The endpoints are public (for uptime monitors), so the Traccar check is cached: repeated calls
// cannot turn into load on Traccar.
const TRACCAR_CHECK_TTL_MS = 30_000;

type TraccarHealth = { status: 'ok' } | { status: 'error'; error: string };

export function healthRoutes(db: Db, traccar: TraccarClient) {
  let traccarCheck: { at: number; result: Promise<TraccarHealth> } | null = null;

  async function checkTraccar(): Promise<TraccarHealth> {
    try {
      await traccar.ping();
      return { status: 'ok' };
    } catch (err) {
      if (!(err instanceof TraccarError)) throw err;
      // Only the kind of failure: the details (URLs, response bodies) stay in the logs.
      console.error(err.message);
      if (err.status === 0) return { status: 'error', error: 'unreachable' };
      // Traccar answers a malformed or unknown token with 400, not 401.
      if ([400, 401, 403].includes(err.status)) return { status: 'error', error: 'unauthorized' };
      return { status: 'error', error: `http ${err.status}` };
    }
  }

  return new Hono()
    .get('/', async (c) => {
      const uptime_s = Math.round((Date.now() - startedAt) / 1000);
      try {
        await db.execute(sql`SELECT 1`);
        return c.json({ status: 'ok', uptime_s });
      } catch {
        return c.json({ status: 'error', uptime_s, error: 'Database unavailable' }, 503);
      }
    })
    .get('/traccar', async (c) => {
      const now = Date.now();
      if (!traccarCheck || now - traccarCheck.at > TRACCAR_CHECK_TTL_MS) {
        traccarCheck = { at: now, result: checkTraccar() };
      }
      const result = await traccarCheck.result;
      return c.json(result, result.status === 'ok' ? 200 : 503);
    });
}
