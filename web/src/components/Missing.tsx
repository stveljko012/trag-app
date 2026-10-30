import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/ui';

/**
 * Marks UI from the design that has no data or backend yet: red outline plus a "missing" tag.
 * The content stays visible but cannot be interacted with.
 */
export function Missing({
  children,
  inline = false,
  className,
  style,
}: {
  children: ReactNode;
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const Tag = inline ? 'span' : 'div';
  return (
    <Tag
      style={style}
      className={cn(
        'relative rounded-lg outline-2 outline-offset-3 outline-danger',
        "after:pointer-events-none after:z-2 after:rounded after:bg-danger after:font-mono after:font-bold after:uppercase after:tracking-[0.04em] after:text-white after:content-['missing']",
        inline
          ? 'inline-flex items-center gap-1 rounded px-0.5 outline-offset-1 after:px-1 after:text-[8px] after:leading-[13px]'
          : 'after:absolute after:-top-[11px] after:right-1.5 after:px-1.5 after:py-px after:text-[10px] after:leading-4',
        className,
      )}
    >
      <Tag inert className="contents">
        {children}
      </Tag>
    </Tag>
  );
}
