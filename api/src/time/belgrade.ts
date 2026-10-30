// "Day" boundaries for users are Europe/Belgrade calendar days, which are 23 or 25 hours long
// on DST change days. Everything here works with real UTC instants (Date) and plain
// YYYY-MM-DD strings for Belgrade calendar days.

export const TIME_ZONE = 'Europe/Belgrade';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function belgradeParts(instant: Date) {
  const parts: Record<string, string> = {};
  for (const { type, value } of partsFormatter.formatToParts(instant)) parts[type] = value;
  return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;
}

/** Belgrade's offset from UTC at `instant`, in ms (+1 h in winter, +2 h in summer). */
export function belgradeOffsetMs(instant: Date): number {
  const p = belgradeParts(instant);
  const wallClockAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function assertDay(day: string) {
  if (!isValidDay(day)) throw new RangeError(`Invalid day: ${day}`);
}

export function addDays(day: string, n: number): string {
  assertDay(day);
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The UTC instant of 00:00 Belgrade time on `day`. */
export function belgradeMidnight(day: string): Date {
  assertDay(day);
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const wallClock = Date.UTC(y, m - 1, d);
  // First guess uses the offset at UTC midnight; the second pass corrects it when a DST switch
  // lies between that guess and the real local midnight. Belgrade switches at 02:00/03:00, so
  // local midnight is never skipped or repeated.
  let t = wallClock - belgradeOffsetMs(new Date(wallClock));
  t = wallClock - belgradeOffsetMs(new Date(t));
  return new Date(t);
}

/** First and last millisecond (inclusive) of a Belgrade calendar day, as UTC instants. */
export function belgradeDayRange(day: string): { from: Date; to: Date } {
  return {
    from: belgradeMidnight(day),
    to: new Date(belgradeMidnight(addDays(day, 1)).getTime() - 1),
  };
}

/** The Belgrade calendar day containing `instant`. */
export function belgradeDay(instant: Date = new Date()): string {
  const p = belgradeParts(instant);
  return `${p.year}-${p.month}-${p.day}`;
}
