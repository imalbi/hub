import { useId, type ReactNode } from 'react';

export function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={`flex min-w-0 flex-col gap-lg rounded-xl border border-border bg-surface p-lg ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-md">
          <h2 id={titleId} className="text-title">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
