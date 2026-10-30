import { cn } from '../lib/ui';

/** Brand mark from public/logo.svg (raspberry tile with the TRAG wordmark). */
export function Logo({ className }: { className?: string }) {
  return <img src="/logo.svg" alt="Trag" className={cn('size-12', className)} />;
}
