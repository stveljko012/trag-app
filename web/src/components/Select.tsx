import * as Radix from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/ui';

export type SelectOption = { value: string; label: string };

/**
 * Dropdown built on Radix Select (keyboard, typeahead, positioning, a11y).
 * Radix reserves the empty string, so "no filter" options need a real value such as "all".
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Izaberi…',
  ariaLabel,
  mono = false,
  disabled = false,
  defaultOpen,
  onOpenChange,
  className,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  /** Monospace labels, for license plates. */
  mono?: boolean;
  disabled?: boolean;
  /** Open the dropdown on mount, e.g. when it appears after an "edit" click. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const labelClass = mono ? 'font-mono font-semibold' : undefined;
  return (
    <Radix.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <Radix.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-[38px] min-w-40 items-center justify-between gap-2 rounded-lg border border-border bg-surface pr-2.5 pl-3 text-sm font-medium text-text transition-colors',
          'hover:enabled:border-primary/40 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-primary',
          'data-[state=open]:outline-2 data-[state=open]:-outline-offset-1 data-[state=open]:outline-primary',
          'data-placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted',
          className,
        )}
      >
        <span className={cn('truncate', labelClass)}>
          <Radix.Value placeholder={placeholder} />
        </span>
        <Radix.Icon className="flex shrink-0 text-muted">
          <ChevronDown size={16} />
        </Radix.Icon>
      </Radix.Trigger>

      <Radix.Portal>
        <Radix.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          // Above Leaflet panes and controls (z-index up to 1000) and the map overlays.
          className="z-3000 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
        >
          <Radix.ScrollUpButton className="flex justify-center py-1 text-muted">
            <ChevronUp size={16} />
          </Radix.ScrollUpButton>
          <Radix.Viewport className="p-1">
            {options.map((opt) => (
              <Radix.Item
                key={opt.value}
                value={opt.value}
                className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm text-text outline-none data-disabled:cursor-default data-disabled:opacity-50 data-highlighted:bg-surface-muted data-[state=checked]:font-semibold data-[state=checked]:text-primary"
              >
                <Radix.ItemText>
                  <span className={labelClass}>{opt.label}</span>
                </Radix.ItemText>
                <Radix.ItemIndicator>
                  <Check size={14} />
                </Radix.ItemIndicator>
              </Radix.Item>
            ))}
          </Radix.Viewport>
          <Radix.ScrollDownButton className="flex justify-center py-1 text-muted">
            <ChevronDown size={16} />
          </Radix.ScrollDownButton>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
