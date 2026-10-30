import type { Config } from '../config.js';

export const MIN_ADMIN_PASSWORD_LENGTH = 10;

/** The owner described by ADMIN_* env vars, or null when they are not set. */
export function ownerFromConfig(config: Config) {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) return null;
  if (config.ADMIN_PASSWORD.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`);
  }
  return { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD, name: config.ADMIN_NAME };
}
