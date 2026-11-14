import { useId, type ReactNode } from 'react';
import { useInSurface } from '../shell/page-surface.tsx';

export function Panel({
  title,
  subtitle,
  action,
  className = '',
  children,
}: {
  title?: string;
  /** A line under the title, in the header block. */
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  // On a page surface a panel is an inner one: lighter than the surface, one radius down, no border (step 47). On Panoramica and Impostazioni it stays the bordered card.
  const inner = useInSurface();
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      data-panel={inner ? '' : undefined}
      className={`flex min-w-0 flex-col gap-lg p-lg ${inner ? 'rounded-lg bg-muted' : 'rounded-xl border border-border bg-surface'} ${className}`}
    >
      {title && (
        <div className={`flex justify-between gap-md ${subtitle ? 'items-start' : 'items-center'}`}>
          <div className="flex min-w-0 flex-col gap-3xs">
            <h2 id={titleId} className="text-title">
              {title}
            </h2>
            {subtitle && <p className="text-body text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
