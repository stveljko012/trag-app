import { fileURLToPath } from 'node:url';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client.js';

// api/drizzle, both from src/db (dev) and dist/db (prod image: /app/drizzle).
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle/', import.meta.url));

// Arbitrary constant so concurrent starts don't run migrations twice.
const LOCK_ID = 7_281_337;

/** Applies pending Drizzle migrations from api/drizzle/. */
export async function migrate(
  { db, pool }: Database,
  migrationsFolder = MIGRATIONS_DIR,
): Promise<void> {
  // Session-level advisory lock on its own connection; the migrator uses other pool connections.
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await drizzleMigrate(db, { migrationsFolder });
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    lock.release();
  }
}
