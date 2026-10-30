import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  db: Db;
  /** The underlying pool, for shutdown and the migration lock. */
  pool: pg.Pool;
}

export function createDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on('error', (err) => console.error('Postgres pool error', err));
  return { pool, db: drizzle(pool, { schema }) };
}
