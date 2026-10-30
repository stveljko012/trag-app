import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonClass, cn } from '../lib/ui';

/**
 * Confirmation modal (Radix AlertDialog: focus trap, Escape, screen reader role).
 * Stays open while `pending`, so the caller closes it when the action settles.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  tone = 'danger',
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialog.Portal>
        {/* Above Leaflet panes and controls, like the Select dropdown. */}
        <AlertDialog.Overlay className="fixed inset-0 z-3000 animate-fade-in bg-slate-900/45 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-3000 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 animate-dialog-in rounded-2xl border border-border bg-surface p-5 shadow-pop">
          <div className="flex gap-3.5">
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-full',
                tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary',
              )}
            >
              <AlertTriangle size={20} />
            </span>
            <div className="min-w-0 pt-0.5">
              <AlertDialog.Title className="text-[1.05rem] font-bold">{title}</AlertDialog.Title>
              <AlertDialog.Description className="mt-1.5 text-sm text-muted">
                {children}
              </AlertDialog.Description>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel className={buttonClass()} disabled={pending}>
              Odustani
            </AlertDialog.Cancel>
            {/* Plain button, not AlertDialog.Action, so the dialog stays open while pending. */}
            <button
              type="button"
              className={buttonClass({ variant: tone })}
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? 'Sačekajte…' : confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
