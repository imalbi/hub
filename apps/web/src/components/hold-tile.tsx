import type { Icon } from '@phosphor-icons/react';
import { useId } from 'react';
import { INTERACTION_FOCUS, useInteractionReducedMotion } from './ui/ui-interaction-motion.ts';
import { useHoldConfirm } from './ui/use-hold-confirm.ts';
import { m } from '../paraglide/messages.js';

const holdMs = 800;

/**
 * A deck tile for a `danger` action: the tile shape of `Tile`, the hold of `HoldButton` (800 ms by pointer, Space or
 * Enter; early release or Esc cancels). A ring fills around the icon while held. `onConfirm` passes `confirmed: true`.
 */
export function HoldTile({
  icon: Icon,
  label,
  holdLabel,
  onConfirm,
}: {
  icon: Icon;
  label: string;
  /** The accessible name, saying it needs a hold. */
  holdLabel: string;
  onConfirm: () => Promise<unknown>;
}) {
  const reduced = useInteractionReducedMotion();
  const { status, progress, begin, cancel } = useHoldConfirm(
    async () => {
      await onConfirm();
    },
    holdMs,
    2200,
    false,
    reduced,
  );
  const hint = useId();
  const state = {
    idle: m.hold_short(),
    holding: m.hold_holding(),
    pending: m.hold_pending(),
    success: m.system_power_done(),
    error: m.hold_failed(),
  }[status];
  return (
    <>
      <button
        type="button"
        aria-label={holdLabel}
        aria-describedby={hint}
        aria-busy={status === 'pending' || undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          begin(`pointer:${event.pointerId}`);
        }}
        onPointerUp={(event) => cancel(`pointer:${event.pointerId}`)}
        onPointerCancel={(event) => cancel(`pointer:${event.pointerId}`)}
        onLostPointerCapture={(event) => cancel(`pointer:${event.pointerId}`)}
        onBlur={() => cancel()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            if (!event.repeat) begin(`key:${event.key}`);
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            cancel(`key:${event.key}`);
          }
        }}
        onClick={(event) => event.preventDefault()}
        className={`hold-tile flex flex-col items-start gap-xs rounded-lg border p-md text-left select-none ${
          status === 'error' ? 'border-danger' : 'border-border'
        } bg-surface ${INTERACTION_FOCUS}`}
      >
        <span aria-hidden className="relative flex size-icon items-center justify-center">
          <Icon className="size-icon" />
          <svg viewBox="0 0 24 24" className="hold-tile-ring absolute -rotate-90" data-on={status === 'holding'}>
            <circle
              ref={progress}
              cx="12"
              cy="12"
              r="11"
              pathLength="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset="1"
            />
          </svg>
        </span>
        <span className="text-label">{label}</span>
        <span
          className={`line-clamp-2 self-stretch text-caption ${status === 'error' ? 'text-danger' : 'text-muted-foreground'}`}
        >
          {state}
        </span>
      </button>
      <span id={hint} className="sr-only">
        {m.hold_hint()}
      </span>
    </>
  );
}
