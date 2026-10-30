import { hash, verify } from '@node-rs/argon2';

// Argon2id with the library defaults (19 MiB, t=2, p=1), per OWASP guidance.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hash('not-a-real-password');
  return dummyHash;
}
