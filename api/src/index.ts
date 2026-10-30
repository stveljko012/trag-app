import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { ownerFromConfig } from './auth/seed.js';
import { countUsers, ensureOwner } from './auth/users.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createDatabase } from './db/client.js';
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

const app = buildApp({
  db,
  traccar,
  publicDir: config.PUBLIC_DIR,
  sessionSecret: config.SESSION_SECRET,
  secureCookies: config.NODE_ENV === 'production',
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
  server.close(async (err) => {
    if (err) console.error(err);
    await database.pool.end().catch((e: unknown) => console.error(e));
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
