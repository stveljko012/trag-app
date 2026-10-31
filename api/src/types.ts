import type { User } from './auth/users.js';
import type { Db } from './db/client.js';
import type { TraccarClient } from './traccar/traccar.js';

export interface AppDeps {
  db: Db;
  traccar: TraccarClient;
  publicDir: string;
  /** Page title, e.g. "Trag · Unique Garden". */
  pageTitle?: string;
  /** The client this instance belongs to, shown on the login page and in the account menu. */
  clientName?: string;
  sessionSecret: string;
  secureCookies: boolean;
}

export interface AppEnv {
  Variables: {
    user: User;
    sessionId: string;
  };
}
