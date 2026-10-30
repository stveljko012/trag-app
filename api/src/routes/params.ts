import { z } from 'zod';
import { belgradeDayRange, isValidDay } from '../time/belgrade.js';

export const daySchema = z.string().refine(isValidDay, 'expected YYYY-MM-DD');

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const HOUR_MS = 60 * 60 * 1000;
const dayOrDateTime = z.union([daySchema, z.iso.datetime({ offset: true })]);

/**
 * Query schema with a `from`/`to` pair plus `extra` fields. Each side is either a Belgrade day
 * (YYYY-MM-DD: `from` means its start, `to` its end, so from=to=2026-10-30 is that whole day)
 * or an ISO 8601 instant. Output has `from`/`to` as Dates.
 */
export function rangeQuery<Extra extends z.ZodRawShape>(maxDays: number, extra: Extra) {
  return z.object({ from: dayOrDateTime, to: dayOrDateTime, ...extra }).transform((value, ctx) => {
    // zod can't see through the generic `extra` here; from/to are always strings.
    const raw = value as unknown as { from: string; to: string };
    const from = isValidDay(raw.from) ? belgradeDayRange(raw.from).from : new Date(raw.from);
    const to = isValidDay(raw.to) ? belgradeDayRange(raw.to).to : new Date(raw.to);
    if (from >= to) {
      ctx.addIssue({ code: 'custom', message: '`from` must be before `to`', path: ['from'] });
      return z.NEVER;
    }
    // +2 h of slack so whole Belgrade days across a DST change still fit.
    if (to.getTime() - from.getTime() > maxDays * 24 * HOUR_MS + 2 * HOUR_MS) {
      ctx.addIssue({
        code: 'custom',
        message: `range is limited to ${maxDays} days`,
        path: ['to'],
      });
      return z.NEVER;
    }
    return { ...value, from, to };
  });
}
