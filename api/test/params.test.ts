import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { rangeQuery } from '../src/routes/params.js';

const schema = rangeQuery(31, { type: z.string().optional() });

describe('rangeQuery', () => {
  it('expands Belgrade days to their full span', () => {
    const r = schema.parse({ from: '2026-10-30', to: '2026-10-30' });
    expect(r.from.toISOString()).toBe('2026-10-29T23:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-30T22:59:59.999Z');
  });

  it('accepts ISO instants and keeps extra fields', () => {
    const r = schema.parse({
      from: '2026-10-30T08:00:00Z',
      to: '2026-10-30T12:00:00+02:00',
      type: 'alarm',
    });
    expect(r.to.toISOString()).toBe('2026-10-30T10:00:00.000Z');
    expect(r.type).toBe('alarm');
  });

  it('rejects reversed ranges, too-long ranges and junk', () => {
    expect(schema.safeParse({ from: '2026-10-30', to: '2026-10-29' }).success).toBe(false);
    expect(schema.safeParse({ from: '2026-09-01', to: '2026-10-30' }).success).toBe(false);
    expect(schema.safeParse({ from: 'yesterday', to: '2026-10-30' }).success).toBe(false);
  });

  it('allows a full 31-day month across the DST change', () => {
    expect(schema.safeParse({ from: '2026-10-01', to: '2026-10-31' }).success).toBe(true);
  });
});
