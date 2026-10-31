import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_NAME: z.string().default('Trag'),
  // Shown in the page title ("Trag · Unique Garden"), so tabs and bookmarks name the client.
  CLIENT_NAME: optional,
  PUBLIC_DIR: z.string().default('./public'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ADMIN_EMAIL: optional,
  ADMIN_PASSWORD: optional,
  ADMIN_NAME: z.string().default('Administrator'),
  TRACCAR_URL: z.string().url().default('http://traccar:8082/api'),
  // Either a token, or user + password for Basic auth. Checked when the client is created.
  TRACCAR_TOKEN: optional,
  TRACCAR_USER: optional,
  TRACCAR_PASS: optional,
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
