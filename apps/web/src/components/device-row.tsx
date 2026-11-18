import type { ReactNode } from 'react';
import { TextMorph } from './ui/text-morph.tsx';
import { LoadingSkeleton } from './ui/loading-skeleton.tsx';

/** One external device of this PC in Dispositivi: its name and state on the left, its controls on the right. */
export function DeviceRow({
  label,
  state,
  stale = false,
  pending = false,
  below,
  children,
}: {
  label: string;
  state: string;
  /** The live connection is down: the state shown is the last one received, so the row dims. */
  stale?: boolean;
  pending?: boolean;
  /** Full width under the line, for a control that needs room (a slider) or an error. */
  below?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <fieldset aria-label={label} className="flex min-w-0 flex-col gap-sm">
      <div className={`flex flex-wrap items-center justify-between gap-md ${stale ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-col">
          <span className="text-label">{label}</span>
          <p className="text-caption break-words text-muted-foreground tabular-nums">
            {pending ? (
              <LoadingSkeleton label={state} rows={1} className="w-xl" />
            ) : (
              <TextMorph animateWidth={false}>{state}</TextMorph>
            )}
          </p>
        </div>
        <div className="flex items-center gap-md">{children}</div>
      </div>
      {below}
    </fieldset>
  );
}
