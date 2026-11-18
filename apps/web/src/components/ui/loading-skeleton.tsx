export function LoadingSkeleton({
  label,
  rows = 3,
  className = '',
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <output aria-label={label} className={`flex flex-col gap-sm ${className}`}>
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
