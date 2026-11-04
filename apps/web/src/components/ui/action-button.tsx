// Hairline UI components, MIT License. Copyright (c) 2026 Hairline UI.
// https://hairlineui.com/license#components
'use client';

import * as React from 'react';
import { TextMorph } from './text-morph.tsx';
import {
  EASE_OUT,
  INTERACTION_FOCUS,
  INTERACTION_PRESS,
  interactionIcon,
  useInteractionReducedMotion,
} from './ui-interaction-motion.ts';

export type ActionStatus = 'idle' | 'pending' | 'success' | 'error';

export interface ActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Async or sync action to execute on click. Automatically handles idle -> pending -> success/error. */
  action?: () => Promise<unknown> | void;
  /** Explicit click handler if action is not used. */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Controlled status state. If passed, overrides internal action state. */
  status?: ActionStatus;
  /** Custom labels for each status. */
  labels?: Partial<Record<ActionStatus, string>>;
  /** Default label in idle state if children is not provided. */
  label?: string;
  /** Leading icon shown in idle state. */
  icon?: React.ReactNode;
  /** Visual variant. Defaults to primary. */
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  /** Button sizing. Defaults to md (36px). */
  size?: 'sm' | 'md' | 'lg';
  /** Duration in ms to show success or error state before auto-reverting to idle. Defaults to 2000ms. */
  resetAfter?: number;
  /** Callback fired when auto-reset triggers. */
  onReset?: () => void;
  /** Called with whatever `action` threw. */
  onError?: (error: unknown) => void;
}

const DEFAULT_LABELS: Record<ActionStatus, string> = {
  idle: 'Save changes',
  pending: 'Saving',
  success: 'Saved',
  error: 'Try again',
};

function SelfDrawingCheck({ drawn, reduced, size }: { drawn: boolean; reduced: boolean; size: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        style={{
          strokeDashoffset: drawn ? 0 : 1,
          transition: drawn && !reduced ? `stroke-dashoffset 420ms ${EASE_OUT} 120ms` : 'none',
        }}
      />
    </svg>
  );
}

function StatusAlert({ size }: { size: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.75v3.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

const variantStyles = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted',
  outline: 'bg-transparent text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted',
  destructive:
    'bg-danger/10 text-danger dark:text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_30%,transparent)] hover:bg-danger/15',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
};

const sizeStyles = {
  sm: {
    height: 'min-h-touch text-label px-sm',
    iconSize: 13,
    spinnerSize: 'size-sm',
  },
  md: {
    height: 'min-h-touch text-label px-md',
    iconSize: 'var(--spacing-icon)',
    spinnerSize: 'size-sm',
  },
  lg: {
    height: 'min-h-touch text-label px-lg',
    iconSize: 'var(--spacing-icon)',
    spinnerSize: 'size-md',
  },
};

export function ActionButton({
  action,
  onClick,
  status: controlledStatus,
  labels,
  label: defaultLabel,
  icon,
  variant = 'primary',
  size = 'md',
  resetAfter = 2000,
  onReset,
  onError,
  children,
  disabled = false,
  className = '',
  style,
  ...props
}: ActionButtonProps) {
  const reduced = useInteractionReducedMotion();
  const [internalStatus, setInternalStatus] = React.useState<ActionStatus>('idle');
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const resetTimer = React.useRef<number>(0);

  const status = controlledStatus ?? internalStatus;
  const busy = status === 'pending';
  const s = sizeStyles[size];

  // Resolve current label text
  const initialText = typeof children === 'string' ? children : defaultLabel;
  const statusLabels = {
    ...DEFAULT_LABELS,
    idle: initialText || DEFAULT_LABELS.idle,
    ...labels,
  };
  const currentLabel = statusLabels[status];

  // Auto reset timer on success or error
  React.useEffect(() => {
    if (status !== 'success' && status !== 'error') return undefined;
    if (resetAfter <= 0) return undefined;

    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      if (controlledStatus === undefined) {
        setInternalStatus('idle');
      }
      onReset?.();
    }, resetAfter);

    return () => window.clearTimeout(resetTimer.current);
  }, [status, resetAfter, controlledStatus, onReset]);

  // Shake animation on error
  React.useEffect(() => {
    if (status !== 'error' || reduced || !btnRef.current) return undefined;
    btnRef.current.animate(
      [
        { transform: 'none' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(-2px)' },
        { transform: 'translateX(2px)' },
        { transform: 'none' },
      ],
      { duration: 380, easing: 'ease-out' },
    );

    return undefined;
  }, [status, reduced]);

  // Click / execution handler
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy || disabled) {
      e.preventDefault();
      return undefined;
    }

    if (onClick) {
      onClick(e);
    }

    if (action) {
      e.preventDefault();
      setInternalStatus('pending');
      try {
        await action();
        setInternalStatus('success');
      } catch (err) {
        setInternalStatus('error');
        onError?.(err);
      }
    }

    return undefined;
  };

  // Tone resolution for error/success overrides
  const toneClass =
    status === 'error'
      ? 'bg-danger/10 text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_30%,transparent)] dark:text-danger'
      : status === 'success' && variant === 'destructive'
        ? 'bg-success/10 text-success shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--success)_30%,transparent)] dark:text-success'
        : variantStyles[variant];

  // Current status icon
  const showLeading = status !== 'idle' || Boolean(icon);

  const icons: Record<ActionStatus, React.ReactNode> = {
    idle: icon,
    // Spins only while pending, so a hidden spinner never keeps the page busy.
    pending: (
      <span
        className={`inline-flex rounded-full border-[1.5px] border-current border-t-transparent ${s.spinnerSize} ${busy ? 'animate-spin' : ''}`}
      />
    ),
    success: <SelfDrawingCheck drawn={status === 'success'} reduced={reduced} size={s.iconSize} />,
    error: <StatusAlert size={s.iconSize} />,
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-status={status}
        disabled={disabled}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        onClick={(event) => {
          void handleClick(event);
        }}
        style={style}
        className={`relative inline-flex cursor-pointer items-center justify-center rounded-full font-medium whitespace-nowrap select-none disabled:cursor-default disabled:opacity-45 aria-disabled:cursor-default ${s.height} ${toneClass} ${INTERACTION_PRESS} ${INTERACTION_FOCUS} ${className}`}
        {...props}
      >
        {/* The icon slot opens and closes; icons trade places through a blur. */}
        <span
          aria-hidden="true"
          className="relative flex shrink-0 items-center justify-center"
          style={{
            width: showLeading ? s.iconSize : 0,
            height: s.iconSize,
            marginRight: showLeading ? 'var(--spacing-xs)' : 0,
            transition: reduced ? 'none' : `width 380ms ${EASE_OUT}, margin-right 380ms ${EASE_OUT}`,
          }}
        >
          {(['idle', 'pending', 'success', 'error'] satisfies ActionStatus[]).map((key) => (
            <span
              key={key}
              className="absolute inset-0 flex items-center justify-center"
              style={interactionIcon(key === status, reduced)}
            >
              {icons[key]}
            </span>
          ))}
        </span>
        <span data-action-label>
          <TextMorph>{currentLabel}</TextMorph>
        </span>
      </button>
      {/* Outside the button, so the announcement isn't read as part of its name. */}
      <output className="sr-only">{status === 'idle' ? '' : currentLabel}</output>
    </>
  );
}

export default ActionButton;
