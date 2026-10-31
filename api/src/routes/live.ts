import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { LiveHub } from '../fleet/liveHub.js';
import type { MapContext } from '../fleet/mapContext.js';
import { toVehicle } from '../fleet/vehicles.js';
import type { Device, Position } from '../traccar/traccar.js';
import type { AppEnv } from '../types.js';

// Below the usual 60 s proxy idle timeouts, so a quiet stream stays open.
const HEARTBEAT_MS = 25_000;

// Traccar's position forwarding (forward.type=json) posts { position, device }. Only the fields
// Trag needs are checked; the rest passes through to toVehicle. `device` is null when Traccar
// has not cached the device yet.
const time = z
  .union([z.string(), z.number()])
  .pipe(z.coerce.date())
  .transform((d) => d.toISOString());
const forwardSchema = z.object({
  position: z.looseObject({
    deviceId: z.number().int(),
    latitude: z.number(),
    longitude: z.number(),
    fixTime: time,
  }),
  device: z.looseObject({ id: z.number().int(), name: z.string() }).nullish(),
});

function sameSecret(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  // Hashing gives equal lengths, which timingSafeEqual needs.
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * POST /webhooks/traccar/position, called by Traccar inside the Docker network (Caddy answers
 * 404 for /api/webhooks/* from outside). Without a secret configured the endpoint does not exist.
 */
export function webhookRoutes(secret: string | undefined, hub: LiveHub, mapContext: MapContext) {
  return new Hono<AppEnv>().post('/traccar/position', async (c) => {
    if (!secret) return c.json({ error: 'Not found' }, 404);
    if (!sameSecret(c.req.header('X-Webhook-Secret'), secret)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const parsed = forwardSchema.safeParse(await c.req.json().catch(() => null));
    // Malformed input will not get better on a retry, so it is acknowledged and dropped.
    if (!parsed.success) {
      console.warn('Ignoring forwarded position', parsed.error.issues);
      return c.body(null, 204);
    }
    const { device, position } = parsed.data as unknown as { device?: Device; position: Position };
    if (!device || device.disabled || !hub.accept(position.deviceId, position.fixTime)) {
      return c.body(null, 204);
    }
    try {
      hub.publish(toVehicle(device, position, await mapContext.get()));
    } catch (err) {
      // The map's polling catches up; a retry from Traccar would not help.
      console.error('Publishing a forwarded position failed', err);
    }
    return c.body(null, 204);
  });
}

/**
 * GET /live: forwarded positions as server-sent `vehicle` events, for signed-in users. The first
 * event, `ready`, says whether the webhook is configured, so the map knows it can poll less.
 */
export function liveRoutes(hub: LiveHub, webhook: boolean) {
  return new Hono<AppEnv>().get('/', (c) => {
    // Caddy's `encode` must not compress the stream, or it buffers events.
    c.header('Content-Encoding', 'identity');
    return streamSSE(c, async (stream) => {
      let close!: () => void;
      const closed = new Promise<void>((resolve) => (close = resolve));
      const unsubscribe = hub.subscribe(
        (vehicle) => void stream.writeSSE({ event: 'vehicle', data: JSON.stringify(vehicle) }),
        close,
      );
      stream.onAbort(close);
      const heartbeat = setInterval(
        () => void stream.writeSSE({ event: 'ping', data: '' }),
        HEARTBEAT_MS,
      );
      try {
        await stream.writeSSE({ event: 'ready', data: JSON.stringify({ webhook }) });
        await closed;
      } finally {
        clearInterval(heartbeat);
        unsubscribe();
      }
    });
  });
}
