import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DisplayState } from './vehicleState';

/** Joins class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const buttonBase =
  'inline-flex h-[38px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 text-sm font-medium no-underline transition-colors disabled:cursor-default disabled:opacity-55';

const buttonVariant = {
  default:
    'border-border bg-surface text-text hover:enabled:bg-surface-muted [&:is(a)]:hover:bg-surface-muted',
  primary:
    'border-transparent bg-primary text-white hover:enabled:bg-primary-hover [&:is(a)]:hover:bg-primary-hover',
  danger: 'border-transparent bg-danger text-white hover:enabled:bg-red-700',
} as const;

/** Classes for buttons, and for links that look like buttons. */
export function buttonClass({
  variant = 'default',
  icon = false,
}: { variant?: keyof typeof buttonVariant; icon?: boolean } = {}): string {
  return cn(buttonBase, buttonVariant[variant], icon && 'w-[38px] px-0');
}

export const inputClass =
  'h-[38px] min-w-0 rounded-lg border border-border bg-surface px-2.5 text-sm focus:outline-2 focus:-outline-offset-1 focus:outline-primary';

/** Pill toggle; pressed state comes from aria-pressed. */
export const chipClass =
  'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[0.85rem] aria-pressed:border-dark aria-pressed:bg-dark aria-pressed:text-white';

export const cardClass = 'rounded-xl border border-border bg-surface shadow-card';

export const plateClass = 'font-mono font-semibold tracking-[0.02em]';

/** Colors per vehicle state. Literal strings so Tailwind can see them. */
export const STATE_TONE: Record<
  DisplayState,
  { dot: string; badge: string; text: string; panel: string }
> = {
  moving: {
    dot: 'bg-success',
    badge: 'bg-green-100 text-green-700',
    text: 'text-green-700',
    panel: 'border-green-200 bg-green-50 text-green-800',
  },
  stopped: {
    dot: 'bg-warning',
    badge: 'bg-amber-100 text-amber-700',
    text: 'text-amber-700',
    panel: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  alarm: {
    dot: 'bg-danger ring-3 ring-danger/20',
    badge: 'bg-danger-soft text-danger',
    text: 'text-danger',
    panel: 'border-red-200 bg-danger-soft text-red-800',
  },
  offline: {
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600',
    text: 'text-muted',
    panel: 'border-border bg-slate-50 text-slate-700',
  },
};

/** "Marko Stojanović" -> "MS". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** A theme color (e.g. '--color-primary') for code that needs a literal value, like Leaflet paths. */
export function themeColor(name: `--color-${string}`): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
