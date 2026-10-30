import { ownerFromConfig } from '../auth/seed.js';
import { ensureOwner } from '../auth/users.js';
import { loadConfig } from '../config.js';
import { migrate } from '../db/migrate.js';
import { createDatabase } from '../db/client.js';

const config = loadConfig();
const owner = ownerFromConfig(config);
if (!owner) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  process.exit(1);
}

const database = createDatabase(config.DATABASE_URL);
try {
  await migrate(database);
  const created = await ensureOwner(database.db, owner);
  console.log(created ? `Created owner ${owner.email}` : `User ${owner.email} already exists`);
} finally {
  await database.pool.end();
}
