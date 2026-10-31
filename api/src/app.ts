import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
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
import { LiveHub } from './fleet/liveHub.js';
import { MapContext } from './fleet/mapContext.js';
import { healthRoutes } from './routes/health.js';
import { liveRoutes, webhookRoutes } from './routes/live.js';
import { locationsRoutes } from './routes/locations.js';
import { vehiclesRoutes } from './routes/vehicles.js';
import { TraccarError } from './traccar/traccar.js';
import type { AppDeps, AppEnv } from './types.js';
import { LocationNotFoundError, ShapeNotEditableError } from './locations/locations.js';

export function buildApp(deps: AppDeps) {
  const root = resolve(deps.publicDir);
  const app = new Hono();
  const mapContext = new MapContext(deps.traccar, deps.db);
  const liveHub = deps.liveHub ?? new LiveHub();

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

  // Public: health, config (the login page needs it), auth (login/logout/me handle their own auth).
  api.route('/health', healthRoutes(deps.db, deps.traccar));
  api.get('/config', (c) => c.json({ clientName: deps.clientName ?? null }));
  api.route('/auth', authRoutes(deps));
  // Traccar's position forwarding; checks its own shared secret.
  api.route('/webhooks', webhookRoutes(deps.webhookSecret, liveHub, mapContext));

  // Everything below requires a session.
  const secured = new Hono<AppEnv>();
  secured.use('*', requireAuth(deps));
  secured.route('/vehicles', vehiclesRoutes(deps.traccar, deps.db, mapContext));
  secured.route('/live', liveRoutes(liveHub, !!deps.webhookSecret));
  secured.route('/drivers', driversRoutes(deps.db, mapContext));
  secured.route('/events', eventsRoutes(deps.traccar));
  secured.route('/locations', locationsRoutes(deps.db, deps.traccar, mapContext));
  api.route('/', secured);

  app.route('/api', api);
  // Unmatched /api paths are a JSON 404, never the SPA.
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  // 2. Static files from the built web app. In dev there is no build (Vite serves the SPA).
  // Hashed build assets never change; everything else (index.html, sw.js, the manifest, icons) is
  // revalidated so a deploy reaches browsers and the installed app right away. Set after the
  // response is built: serveStatic's onFound runs too late to add headers.
  app.use('*', async (c, next) => {
    await next();
    if (!c.res.ok) return;
    c.res.headers.set(
      'Cache-Control',
      c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
  });

  // index.html carries this client's page title, so it never comes straight from disk: not for
  // "/" or "/index.html" (which the service worker caches), nor as the SPA fallback below.
  const indexPath = resolve(root, 'index.html');
  let indexHtml: string | undefined;
  const serveIndex = (c: Context) => {
    if (indexHtml === undefined) {
      if (!existsSync(indexPath)) return c.text('Web app not built', 404);
      const title = `<title>${escapeHtml(deps.pageTitle ?? 'Trag')}</title>`;
      indexHtml = readFileSync(indexPath, 'utf8').replace(/<title>[^<]*<\/title>/, title);
    }
    return c.html(indexHtml);
  };
  app.get('/', serveIndex);
  app.get('/index.html', serveIndex);

  if (existsSync(root)) app.use('*', serveStatic({ root }));

  // 3. SPA fallback: client-side routes get index.html.
  app.get('*', serveIndex);

  return app;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
