import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { ownerFromConfig } from './auth/seed.js';
import { countUsers, ensureOwner } from './auth/users.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createDatabase } from './db/client.js';
import { LiveHub } from './fleet/liveHub.js';
import { TraccarClient } from './traccar/traccar.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const traccar = new TraccarClient({
  url: config.TRACCAR_URL,
  token: config.TRACCAR_TOKEN,
  user: config.TRACCAR_USER,
  pass: config.TRACCAR_PASS,
});
const database = createDatabase(config.DATABASE_URL);
const { db } = database;

await migrate(database);

// First boot convenience: create the owner from env when the users table is empty.
if ((await countUsers(db)) === 0) {
  const owner = ownerFromConfig(config);
  if (owner) {
    await ensureOwner(db, owner);
    console.log(`Created owner ${owner.email}`);
  } else {
    console.warn(
      'No users exist and ADMIN_EMAIL/ADMIN_PASSWORD are not set, so nobody can log in. ' +
        'Set them and restart, or run the seed script.',
    );
  }
}

if (config.WEBHOOK_SECRET && config.WEBHOOK_SECRET.length < 32) {
  // A warning, not a startup failure: an existing short secret must not take the app down.
  console.warn('WEBHOOK_SECRET is shorter than 32 characters; use openssl rand -hex 32');
}
if (!config.WEBHOOK_SECRET) console.log('WEBHOOK_SECRET is not set; live map positions are off');

const liveHub = new LiveHub();
const app = buildApp({
  db,
  traccar,
  publicDir: config.PUBLIC_DIR,
  clientName: config.CLIENT_NAME,
  pageTitle: config.CLIENT_NAME ? `${config.APP_NAME} · ${config.CLIENT_NAME}` : config.APP_NAME,
  sessionSecret: config.SESSION_SECRET,
  secureCookies: config.NODE_ENV === 'production',
  webhookSecret: config.WEBHOOK_SECRET,
  liveHub,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`${config.APP_NAME} API listening on :${info.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  const timer = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();
  // Open live streams would otherwise keep the server from closing.
  liveHub.close();
  server.close(async (err) => {
    if (err) console.error(err);
    await database.pool.end().catch((e: unknown) => console.error(e));
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
