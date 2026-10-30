import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Only needed for `drizzle-kit studio`/`push`; `generate` works offline.
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://trag:trag@localhost:5432/trag' },
});
