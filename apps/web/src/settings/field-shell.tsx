import type { ReactNode } from 'react';

/**
 * Label, control and one caption line for a control that has no label of its own (stepper, switch, rows). Same
 * insets as the vendored `Field`, so every row of the form lines up. The control is named through `${id}-label` and
 * described by `${id}-hint`.
 */
export function FieldShell({
  id,
  label,
  caption,
  error,
  aside,
  children,
}: {
  id: string;
  label: string;
  caption?: string;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col">
      <div className="flex items-baseline justify-between gap-sm px-sm pb-2xs">
        <span id={`${id}-label`} className="text-label text-foreground">
          {label}
        </span>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="pt-2xs pl-sm text-caption text-danger">
          {error}
        </p>
      ) : (
        caption && (
          <p id={`${id}-hint`} className="pt-2xs pl-sm text-caption text-muted-foreground">
            {caption}
          </p>
        )
      )}
    </div>
  );
}
