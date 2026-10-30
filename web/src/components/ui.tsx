import type { ReactNode } from 'react';
import type { DisplayState } from '../lib/vehicleState';
import { cn, STATE_TONE } from '../lib/ui';

export function Dot({ state, className }: { state: DisplayState; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', STATE_TONE[state].dot, className)}
    />
  );
}

export function Badge({ state, children }: { state: DisplayState; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[0.8rem] font-semibold',
        STATE_TONE[state].badge,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg bg-surface-muted px-3 py-2.5', className)}>
      <div className="text-[0.78rem] text-muted">{label}</div>
      <div className="mt-0.5 text-[1.1rem] font-bold">{value}</div>
    </div>
  );
}

export function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger', className)}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-muted">{children}</div>;
}

/** Gray placeholder block shown while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('block animate-pulse rounded-md bg-slate-200/80', className)} />
  );
}
