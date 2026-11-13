import type { ReactNode } from 'react';

/** One external device of this PC in Dispositivi: its name and state on the left, its controls on the right. */
export function DeviceRow({
  label,
  state,
  stale = false,
  below,
  children,
}: {
  label: string;
  state: string;
  /** The live connection is down: the state shown is the last one received, so the row dims. */
  stale?: boolean;
  /** Full width under the line, for a control that needs room (a slider) or an error. */
  below?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <fieldset aria-label={label} className="flex min-w-0 flex-col gap-sm">
      <div className={`flex flex-wrap items-center justify-between gap-md ${stale ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-col">
          <span className="text-label">{label}</span>
          <p className="text-caption break-words text-muted-foreground tabular-nums">{state}</p>
        </div>
        <div className="flex items-center gap-md">{children}</div>
      </div>
      {below}
    </fieldset>
  );
}
