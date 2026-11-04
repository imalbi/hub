// Hairline UI components, MIT License. Copyright (c) 2026 Hairline UI.
// https://hairlineui.com/license#components
'use client';

import * as React from 'react';
import { NumberRoll } from './number-roll.tsx';
import { TextMorph } from './text-morph.tsx';
import { EASE_OUT, useInteractionReducedMotion } from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * BADGE: a status, a tag or a count
 *
 *   status   "Pending" → "Paid": the colours ease across and the
 *            word morphs, letters both share staying put
 *   live     a dot that breathes a ring outward (for "Live",
 *            "Building"); it rests when nothing is happening
 *   count    numbers roll the way they changed and cap at 99+;
 *            a count that drops to zero folds away
 * ───────────────────────────────────────────────────────── */

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  children?: string;
  tone?: BadgeTone;
  /** Hairline only, no fill. */
  outline?: boolean;
  /** A dot before the text; `pulse` makes it breathe. */
  dot?: boolean | 'pulse';
  /** A number instead of text: rolls, caps at `max`, folds away at 0 unless `showZero`. */
  count?: number;
  max?: number;
  showZero?: boolean;
  icon?: React.ReactNode;
  /** 20px or 24px tall. */
  size?: 'sm' | 'md';
}

const FILL: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success dark:text-success',
  warning: 'bg-accent/14 text-accent dark:text-accent',
  danger: 'bg-danger/10 text-danger dark:text-danger',
};
const LINE: Record<BadgeTone, string> = {
  neutral: 'text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
  primary: 'text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_40%,transparent)]',
  success: 'text-success dark:text-success shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--success)_40%,transparent)]',
  warning: 'text-accent dark:text-accent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_45%,transparent)]',
  danger: 'text-danger dark:text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_40%,transparent)]',
};
const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-accent',
  danger: 'bg-danger',
};

export function Badge({
  children,
  tone = 'neutral',
  outline,
  dot,
  count,
  max = 99,
  showZero,
  icon,
  size = 'md',
  className = '',
  ...props
}: BadgeProps) {
  const reduced = useInteractionReducedMotion();
  const isCount = count !== undefined;
  const hidden = isCount && count <= 0 && !showZero;
  const sm = size === 'sm';

  const badge = (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap tabular-nums transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [&_svg]:size-sm ${
        sm ? 'h-md gap-2xs px-2xs text-caption' : 'h-lg gap-2xs px-xs text-caption'
      } ${isCount ? (sm ? 'min-w-md justify-center' : 'min-w-lg justify-center') : ''} ${outline ? LINE[tone] : FILL[tone]} ${className}`}
      {...props}
    >
      {dot && (
        <span className="relative flex size-2xs shrink-0">
          {dot === 'pulse' && !reduced && (
            <span
              className={`absolute inset-0 rounded-full ${DOT[tone]} [animation:ui-ping_1.6s_cubic-bezier(0,0,0.2,1)_infinite]`}
            />
          )}
          <span className={`relative size-2xs rounded-full transition-colors duration-300 ${DOT[tone]}`} />
        </span>
      )}
      {icon}
      {isCount ? (
        count > max ? (
          <span>
            <NumberRoll value={max} />+
          </span>
        ) : (
          <NumberRoll value={Math.max(0, count)} />
        )
      ) : (
        children && <TextMorph>{children}</TextMorph>
      )}
    </span>
  );

  if (!isCount) return badge;
  // A count folds away at zero instead of blinking out.
  return (
    <span
      className="inline-grid"
      aria-hidden={hidden || undefined}
      style={{
        gridTemplateColumns: hidden ? '0fr' : '1fr',
        opacity: hidden ? 0 : 1,
        scale: hidden && !reduced ? '0.6' : '1',
        transition: reduced
          ? 'none'
          : `grid-template-columns 320ms ${EASE_OUT}, opacity 200ms ${EASE_OUT}, scale 320ms ${EASE_OUT}`,
      }}
    >
      <span className="min-w-0 overflow-hidden">{badge}</span>
    </span>
  );
}

export default Badge;
