import type { User } from './auth/users.js';
import type { Db } from './db/client.js';
import type { LiveHub } from './fleet/liveHub.js';
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
  /** Shared with Traccar's position forwarding; without it the webhook is off. */
  webhookSecret?: string;
  /** Live map fan-out; created by buildApp when not given. */
  liveHub?: LiveHub;
}

export interface AppEnv {
  Variables: {
    user: User;
    sessionId: string;
  };
}
