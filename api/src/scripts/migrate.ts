import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';
import { migrate } from '../db/migrate.js';

const database = createDatabase(loadConfig().DATABASE_URL);
try {
  await migrate(database);
  console.log('Migrations applied');
} finally {
  await database.pool.end();
}
