import type { ReactNode } from 'react';
import { useAppConfig } from '../api/queries';
import { cn } from '../lib/ui';

/**
 * A page's heading row with the client name above it (desktop only: phones keep the height).
 * `children` is the h1 plus anything that sits on its line, such as a count.
 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  const clientName = useAppConfig().data?.clientName;
  return (
    <div className={cn('min-w-0', className)}>
      {clientName && (
        <div className="mb-0.5 truncate text-[0.75rem] font-semibold tracking-[0.04em] text-primary uppercase max-md:hidden">
          {clientName}
        </div>
      )}
      <div className="flex items-baseline gap-x-4">{children}</div>
    </div>
  );
}
