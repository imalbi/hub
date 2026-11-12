// Hairline UI components, MIT License. Copyright (c) 2026 Hairline UI.
// https://hairlineui.com/license#components
'use client';

import * as React from 'react';
import { WarningCircleIcon, FingerprintIcon } from '@phosphor-icons/react';
import { TextMorph } from './text-morph.tsx';
import { INTERACTION_FOCUS, interactionIcon, useInteractionReducedMotion } from './ui-interaction-motion.ts';
import { useHoldConfirm, type HoldStatus } from './use-hold-confirm.ts';
export type { HoldStatus } from './use-hold-confirm.ts';

export interface HoldToConfirmProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'children'
> {
  onConfirm: () => void | Promise<void>;
  duration?: number;
  resetAfter?: number;
  labels?: Partial<Record<HoldStatus, string>>;
  icon?: React.ReactNode;
  /** Every change of state: holding, pending, success, error, back to idle. */
  onStatusChange?: (status: HoldStatus) => void;
  /** How to use it, for screen readers. Hub passes its Italian copy. */
  hint?: string;
  /** Hub: `outline` for a row of several, where a filled pill each would shout. */
  variant?: 'primary' | 'outline';
}
const LABELS = {
  idle: 'Hold to confirm',
  holding: 'Keep holding',
  pending: 'Confirming',
  success: 'Confirmed',
  error: 'Hold to retry',
};

/** Press and keep holding. The threshold owns the action; a click never submits it. */
export function HoldToConfirm({
  onConfirm,
  duration = 1100,
  resetAfter = 2200,
  labels,
  icon,
  onStatusChange,
  hint: hintText,
  variant = 'primary',
  disabled = false,
  className = '',
  ...props
}: HoldToConfirmProps) {
  const reduced = useInteractionReducedMotion();
  const delay = Number.isFinite(duration) ? Math.max(300, Math.min(5000, duration)) : 1100;
  const { status, progress, begin, cancel } = useHoldConfirm(onConfirm, delay, resetAfter, disabled, reduced);
  const report = React.useRef(onStatusChange);
  React.useLayoutEffect(() => {
    report.current = onStatusChange;
  });
  React.useEffect(() => {
    report.current?.(status);
  }, [status]);
  const text = { ...LABELS, ...labels }[status];
  const hint = React.useId();
  const pending = status === 'pending',
    succeeded = status === 'success';
  return (
    <>
      <button
        {...props}
        type="button"
        disabled={disabled}
        aria-describedby={hint}
        aria-busy={pending || undefined}
        aria-disabled={pending || succeeded || disabled || undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return undefined;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus({ preventScroll: true });
          begin(`pointer:${event.pointerId}`);

          return undefined;
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return undefined;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            cancel(`pointer:${event.pointerId}`);

          return undefined;
        }}
        onPointerUp={(event) => cancel(`pointer:${event.pointerId}`)}
        onPointerCancel={(event) => cancel(`pointer:${event.pointerId}`)}
        onLostPointerCapture={(event) => cancel(`pointer:${event.pointerId}`)}
        onPointerLeave={(event) => cancel(`pointer:${event.pointerId}`)}
        onBlur={() => cancel()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
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
        className={`relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-xs overflow-clip rounded-full border px-md text-label font-medium transition-colors select-none disabled:cursor-default disabled:opacity-40 aria-disabled:cursor-default ${status === 'error' ? 'border-destructive/40 bg-destructive/5 text-destructive' : variant === 'outline' ? 'border-border text-foreground hover:bg-muted' : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'} ${INTERACTION_FOCUS} ${className}`}
        style={{ touchAction: 'none', ...props.style }}
      >
        <span aria-hidden="true" className="relative size-md shrink-0">
          <span
            className="absolute inset-0 flex items-center justify-center [&>svg]:size-md"
            style={interactionIcon(status === 'idle' || status === 'holding', reduced || pending)}
          >
            {icon ?? <FingerprintIcon />}
          </span>
          <svg
            viewBox="0 0 24 24"
            className="absolute -inset-2xs size-lg -rotate-90"
            style={{ opacity: status === 'holding' ? 1 : 0, transition: reduced ? 'none' : 'opacity 180ms ease-out' }}
          >
            <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
            <circle
              ref={progress}
              cx="12"
              cy="12"
              r="10.5"
              pathLength="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="1"
              strokeDashoffset="1"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center" style={interactionIcon(pending, reduced)}>
            <span
              className={`size-md rounded-full border-[1.5px] border-current/30 border-t-current ${pending && !reduced ? 'animate-spin' : ''}`}
            />
          </span>
          <svg viewBox="0 0 20 20" className="absolute inset-0 size-md" style={interactionIcon(succeeded, reduced)}>
            <path
              d="m4 10 4 4 8-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              style={{
                strokeDasharray: 1,
                strokeDashoffset: succeeded ? 0 : 1,
                transition: reduced ? 'none' : 'stroke-dashoffset 380ms ease-out 80ms',
              }}
            />
          </svg>
          <WarningCircleIcon
            className="absolute inset-0 size-md"
            style={interactionIcon(status === 'error', reduced)}
          />
        </span>
        <TextMorph>{text}</TextMorph>
      </button>
      <span id={hint} className="sr-only">
        {hintText ??
          `Hold the pointer, Space or Enter for ${delay / 1000} seconds. Release early or press Escape to cancel.`}
      </span>
      <output className="sr-only">{status === 'idle' ? '' : text}</output>
    </>
  );
}
