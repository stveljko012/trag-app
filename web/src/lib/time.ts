// All user-facing dates are Europe/Belgrade, Serbian (Latin) formatting.

const TIME_ZONE = 'Europe/Belgrade';
const LOCALE = 'sr-Latn-RS';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const longDayFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Belgrade calendar day (YYYY-MM-DD) containing `instant`. */
export function belgradeDay(instant: Date = new Date()): string {
  return dayFormatter.format(instant);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** "Petak, 30. oktobar 2026." for a YYYY-MM-DD day (only the first letter capitalized). */
export function formatLongDay(day: string): string {
  const text = longDayFormatter.format(new Date(`${day}T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "pre 5 s", "pre 3 min", "pre 2 h", then an absolute date. */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `pre ${s} s`;
  if (s < 3600) return `pre ${Math.floor(s / 60)} min`;
  if (s < 24 * 3600) return `pre ${Math.floor(s / 3600)} h`;
  return formatDateTime(iso);
}

/** "1 h 36 min", "12 min", "45 s". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${seconds} s`;
}

export function formatKm(km: number): string {
  return `${km.toLocaleString(LOCALE, { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
