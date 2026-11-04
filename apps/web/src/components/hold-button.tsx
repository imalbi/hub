import { HoldToConfirm } from './ui/hold-to-confirm.tsx';
import { m } from '../paraglide/messages.js';

/**
 * The one control for a `danger` action: hold 800 ms (pointer, or Space or Enter), early release or Esc cancels, and
 * `onConfirm` runs once. The server refuses those actions without `confirmed: true`, which only this passes.
 */
export function HoldButton({
  label,
  idle,
  done,
  onConfirm,
  className = '',
}: {
  /** The accessible name; it says the button needs a hold ("Tieni premuto per ..."). */
  label: string;
  idle: string;
  done: string;
  onConfirm: () => Promise<unknown>;
  className?: string;
}) {
  return (
    <HoldToConfirm
      aria-label={label}
      duration={800}
      hint={m.hold_hint()}
      labels={{ idle, holding: m.hold_holding(), pending: m.hold_pending(), success: done, error: m.hold_failed() }}
      onConfirm={async () => {
        await onConfirm();
      }}
      className={className}
    />
  );
}
