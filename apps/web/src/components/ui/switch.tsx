// Hairline UI · switch · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import {
  EASE_OUT,
  EASE_THROW,
  INTERACTION_FOCUS,
  interactionIcon,
  useInteractionReducedMotion,
} from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * SWITCH: on and off, with weight
 *
 *   press    the thumb stretches toward the side it will go
 *   flip     it's thrown across with a slight overshoot while the
 *            track fills; the fill and thumb move as one
 *   async    if onCheckedChange returns a promise, the switch
 *            flips at once and the thumb spins until it settles;
 *            a rejection throws it back and shakes the track
 * ───────────────────────────────────────────────────────── */

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  checked?: boolean;
  defaultChecked?: boolean;
  /** Return a promise to show the pending thumb; throw to put it back. */
  onCheckedChange?: (checked: boolean) => void | Promise<unknown>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** 1rem or 1.25rem tall. */
  size?: 'sm' | 'md';
  /** Put the label before the switch (settings rows). */
  labelPosition?: 'start' | 'end';
  ref?: React.Ref<HTMLButtonElement>;
}

// rem, so the switch scales with the desk root size like everything else.
const SIZES = { sm: { w: 1.75, h: 1, pad: 0.125 }, md: { w: 2.25, h: 1.25, pad: 0.125 } };
const STRETCH = 0.25;

export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  size = 'md',
  labelPosition = 'end',
  disabled,
  className = '',
  id,
  ref,
  ...props
}: SwitchProps) {
  const reduced = useInteractionReducedMotion();
  const auto = React.useId();
  const switchId = id ?? auto;
  const track = React.useRef<HTMLSpanElement>(null);
  const [own, setOwn] = React.useState(defaultChecked);
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
  const [pressed, setPressed] = React.useState(false);
  const on = optimistic ?? (checked !== undefined ? checked : own);
  const pending = optimistic !== null;
  const s = SIZES[size];
  const thumb = s.h - s.pad * 2;
  const travel = s.w - thumb - s.pad * 2;
  const stretch = pressed && !reduced ? STRETCH : 0;

  const toggle = () => {
    if (disabled || pending) return;
    const next = !on;
    const result = onCheckedChange?.(next);
    if (result instanceof Promise) {
      setOptimistic(next);
      void settle(result, next);
    } else if (checked === undefined) setOwn(next);
  };

  // A rejection puts the switch back and shakes the track; the caller owns the error itself.
  const settle = async (pendingChange: Promise<unknown>, next: boolean) => {
    let failed = false;
    try {
      await pendingChange;
    } catch {
      failed = true;
    }
    if (!failed && checked === undefined) setOwn(next);
    setOptimistic(null);
    if (failed && !reduced)
      track.current?.animate(
        [
          { transform: 'none' },
          { transform: 'translateX(-0.1875rem)' },
          { transform: 'translateX(0.1875rem)' },
          { transform: 'none' },
        ],
        { duration: 320, easing: 'ease-out' },
      );
  };

  const control = (
    <button
      ref={ref}
      id={switchId}
      type="button"
      role="switch"
      aria-checked={on}
      aria-busy={pending || undefined}
      disabled={disabled}
      onClick={toggle}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onBlur={() => setPressed(false)}
      className={`relative inline-flex shrink-0 cursor-pointer rounded-full disabled:cursor-default disabled:opacity-50 ${INTERACTION_FOCUS}`}
      style={{ width: `${s.w}rem`, height: `${s.h}rem` }}
      {...props}
    >
      <span
        ref={track}
        className="absolute inset-0 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--foreground)_12%,var(--muted))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]"
      >
        <span
          className="absolute inset-0 rounded-full bg-primary"
          style={{ opacity: on ? 1 : 0, transition: reduced ? 'none' : `opacity 260ms ${EASE_OUT}` }}
        />
      </span>
      <span
        className="absolute rounded-full bg-background shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]"
        style={{
          top: `${s.pad}rem`,
          left: `${s.pad}rem`,
          height: `${thumb}rem`,
          width: `${thumb + stretch}rem`,
          // Stretching toward where it's going: grow from the far edge when on.
          transform: `translateX(${on ? travel - stretch : 0}rem)`,
          transition: reduced ? 'none' : `transform 420ms ${EASE_THROW}, width 260ms ${EASE_OUT}`,
        }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center text-primary"
          style={interactionIcon(pending, reduced)}
        >
          <span
            className={`size-[60%] rounded-full border-[1.5px] border-current border-t-transparent ${pending ? 'animate-spin' : ''}`}
          />
        </span>
      </span>
    </button>
  );

  if (!label && !description) return <span className={className}>{control}</span>;

  return (
    <div
      className={`flex items-start gap-sm ${labelPosition === 'start' ? 'flex-row-reverse justify-between' : ''} ${className}`}
    >
      <span className="mt-3xs">{control}</span>
      <label
        htmlFor={switchId}
        className={`flex min-w-0 flex-col gap-3xs ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
      >
        {label && <span className="text-label text-foreground">{label}</span>}
        {description && <span className="text-caption text-muted-foreground">{description}</span>}
      </label>
    </div>
  );
}

export default Switch;
