import { describe, expect, it } from 'vitest';
import { addDays, belgradeDay, formatAgo, formatDuration, formatLongDay, formatTime } from './time';

describe('time helpers', () => {
  it('uses the Belgrade calendar day', () => {
    expect(belgradeDay(new Date('2026-10-29T23:30:00Z'))).toBe('2026-10-30');
    expect(belgradeDay(new Date('2026-07-14T21:59:00Z'))).toBe('2026-07-14');
  });

  it('formats times in Belgrade time', () => {
    expect(formatTime('2026-10-30T13:20:00Z')).toBe('14:20');
    expect(formatTime('2026-07-15T13:20:00Z')).toBe('15:20');
  });

  it('formats a long Serbian day with only the first letter capitalized', () => {
    expect(formatLongDay('2026-10-30')).toBe('Petak, 30. oktobar 2026.');
  });

  it('adds days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(12 * 60)).toBe('12 min');
    expect(formatDuration(5760)).toBe('1 h 36 min');
    expect(formatDuration(7200)).toBe('2 h');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    expect(formatAgo('2026-10-30T11:59:55Z', now)).toBe('pre 5 s');
    expect(formatAgo('2026-10-30T11:57:00Z', now)).toBe('pre 3 min');
    expect(formatAgo('2026-10-30T10:00:00Z', now)).toBe('pre 2 h');
  });
});
