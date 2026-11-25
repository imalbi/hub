import { CircleNotchIcon } from '@phosphor-icons/react';

export function LoadingSkeleton({
  label,
  rows = 3,
  variant = 'rows',
  className = '',
}: {
  label: string;
  rows?: number;
  variant?: 'rows' | 'centered';
  className?: string;
}) {
  if (variant === 'centered') {
    return (
      <output
        aria-label={label}
        className={`flex w-full flex-col items-center justify-center gap-sm px-lg py-touch text-center text-muted-foreground motion-safe:animate-loading-in ${className}`}
      >
        <CircleNotchIcon aria-hidden="true" className="size-icon-lg animate-spin motion-reduce:animate-none" />
        <span className="text-label">{label}</span>
      </output>
    );
  }

  return (
    <output aria-label={label} className={`flex flex-col gap-sm motion-safe:animate-loading-in ${className}`}>
      {Array.from({ length: rows }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="h-md w-full rounded-sm bg-muted-foreground/20 motion-safe:animate-pulse"
        />
      ))}
    </output>
  );
}
