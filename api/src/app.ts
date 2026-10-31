import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from './auth/middleware.js';
import {
  DriverHasHistoryError,
  DriverInactiveError,
  DriverNotFoundError,
} from './drivers/drivers.js';
import { authRoutes } from './routes/auth.js';
import { driversRoutes } from './routes/drivers.js';
import { eventsRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { locationsRoutes } from './routes/locations.js';
import { vehiclesRoutes } from './routes/vehicles.js';
import { TraccarError } from './traccar/traccar.js';
import type { AppDeps, AppEnv } from './types.js';
import { LocationNotFoundError, ShapeNotEditableError } from './locations/locations.js';

export function buildApp(deps: AppDeps) {
  const root = resolve(deps.publicDir);
  const app = new Hono();

  // 1. API routes.
  const api = new Hono<AppEnv>();
  api.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof TraccarError) {
      console.error(err.message);
      const denied = err.status === 401 || err.status === 403;
      return c.json(
        {
          error: denied
            ? 'GPS server je odbio zahtev (proverite prava naloga na GPS serveru)'
            : 'Greška u komunikaciji sa GPS serverom',
        },
        502,
      );
    }
    if (err instanceof LocationNotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof ShapeNotEditableError) return c.json({ error: err.message }, 409);
    if (err instanceof DriverNotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof DriverInactiveError) return c.json({ error: err.message }, 409);
    if (err instanceof DriverHasHistoryError) return c.json({ error: err.message }, 409);
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // Public: health, auth (login/logout/me handle their own auth).
  api.route('/health', healthRoutes(deps.db, deps.traccar));
  api.route('/auth', authRoutes(deps));

  // Everything below requires a session.
  const secured = new Hono<AppEnv>();
  secured.use('*', requireAuth(deps));
  secured.route('/vehicles', vehiclesRoutes(deps.traccar, deps.db));
  secured.route('/drivers', driversRoutes(deps.db));
  secured.route('/events', eventsRoutes(deps.traccar));
  secured.route('/locations', locationsRoutes(deps.db, deps.traccar));
  api.route('/', secured);

  app.route('/api', api);
  // Unmatched /api paths are a JSON 404, never the SPA.
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  // 2. Static files from the built web app. In dev there is no build (Vite serves the SPA).
  if (existsSync(root)) app.use('*', serveStatic({ root }));

  // 3. SPA fallback: client-side routes get index.html.
  const indexPath = resolve(root, 'index.html');
  let indexHtml: string | undefined;
  app.get('*', (c) => {
    if (indexHtml === undefined) {
      if (!existsSync(indexPath)) return c.text('Web app not built', 404);
      indexHtml = readFileSync(indexPath, 'utf8');
    }
    return c.html(indexHtml);
  });

  return app;
}
