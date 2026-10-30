import { randomBytes } from 'node:crypto';
import { and, eq, gt, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { publicUserColumns, type User } from './users.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Sliding expiry is written at most once per this interval to avoid a DB write per request.
export const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;

export interface Session {
  id: string;
  expiresAt: Date;
  user: User;
}

export async function createSession(db: Db, userId: number): Promise<Session['id']> {
  const id = randomBytes(32).toString('hex');
  const now = new Date();
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now)));
  await db
    .insert(sessions)
    .values({ id, userId, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) });
  return id;
}

export async function getSession(db: Db, id: string): Promise<Session | null> {
  const [row] = await db
    .select({ user: publicUserColumns, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  return row ? { id, expiresAt: row.expiresAt, user: row.user } : null;
}

export function needsRefresh(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() - now < SESSION_TTL_MS - SESSION_REFRESH_MS;
}

export async function extendSession(db: Db, id: string): Promise<Date> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  return expiresAt;
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}
