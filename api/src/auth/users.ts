import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword } from './password.js';

export type Role = 'owner' | 'viewer';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export const publicUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(
  db: Db,
  email: string,
): Promise<(User & { passwordHash: string }) | null> {
  const [user] = await db
    .select({ ...publicUserColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  return user ?? null;
}

/** Creates the owner if no user with that email exists. Returns true when a user was created. */
export async function ensureOwner(
  db: Db,
  { email, password, name }: { email: string; password: string; name: string },
): Promise<boolean> {
  const created = await db
    .insert(users)
    .values({
      email: normalizeEmail(email),
      passwordHash: await hashPassword(password),
      name,
      role: 'owner',
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  return created.length === 1;
}

export function countUsers(db: Db): Promise<number> {
  return db.$count(users);
}
