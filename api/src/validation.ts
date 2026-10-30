import { zValidator as honoZodValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';

/** zod validator that responds with `{ error }` like the rest of the API. */
export function zValidator<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return honoZodValidator(target, schema, (result, c) => {
    if (result.success) return;
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    return c.json({ error: `Neispravan unos (${where}${issue?.message ?? 'invalid'})` }, 400);
  });
}
