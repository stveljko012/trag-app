import { describe, expect, it } from 'vitest';
import {
  addDays,
  belgradeDay,
  belgradeDayRange,
  belgradeMidnight,
  belgradeOffsetMs,
  isValidDay,
} from '../src/time/belgrade.js';

const HOUR = 60 * 60 * 1000;

describe('Belgrade day boundaries', () => {
  it('uses UTC+1 in winter', () => {
    expect(belgradeMidnight('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });

  it('uses UTC+2 in summer', () => {
    expect(belgradeMidnight('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  it('has a 24 h day normally', () => {
    const { from, to } = belgradeDayRange('2026-10-30');
    expect(from.toISOString()).toBe('2026-10-29T23:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-30T22:59:59.999Z');
    expect(to.getTime() + 1 - from.getTime()).toBe(24 * HOUR);
  });

  it('has a 23 h day when clocks go forward (2026-03-29)', () => {
    const { from, to } = belgradeDayRange('2026-03-29');
    expect(from.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(to.toISOString()).toBe('2026-03-29T21:59:59.999Z');
    expect(to.getTime() + 1 - from.getTime()).toBe(23 * HOUR);
  });

  it('has a 25 h day when clocks go back (2026-10-25)', () => {
    const { from, to } = belgradeDayRange('2026-10-25');
    expect(from.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-25T22:59:59.999Z');
    expect(to.getTime() + 1 - from.getTime()).toBe(25 * HOUR);
  });

  it('adjacent days share a boundary with no gap or overlap', () => {
    for (const day of ['2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25', '2026-12-31']) {
      expect(belgradeDayRange(day).to.getTime() + 1).toBe(
        belgradeMidnight(addDays(day, 1)).getTime(),
      );
    }
  });

  it('maps instants to the Belgrade calendar day', () => {
    expect(belgradeDay(new Date('2026-10-29T22:59:59Z'))).toBe('2026-10-29');
    expect(belgradeDay(new Date('2026-10-29T23:00:00Z'))).toBe('2026-10-30');
    expect(belgradeDay(new Date('2026-07-14T22:00:00Z'))).toBe('2026-07-15');
  });

  it('reports the offset around the autumn switch', () => {
    expect(belgradeOffsetMs(new Date('2026-10-25T00:59:59Z'))).toBe(2 * HOUR);
    expect(belgradeOffsetMs(new Date('2026-10-25T01:00:00Z'))).toBe(1 * HOUR);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('validates day strings', () => {
    expect(isValidDay('2026-10-30')).toBe(true);
    expect(isValidDay('2026-02-29')).toBe(false);
    expect(isValidDay('2026-1-5')).toBe(false);
    expect(isValidDay('30.10.2026')).toBe(false);
    expect(() => belgradeMidnight('2026-13-01')).toThrow(RangeError);
  });
});
