// Hairline UI · input · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { EASE_OUT, useInteractionReducedMotion } from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * FIELD: the column every text control sits in
 *
 *   label    above, with an optional aside on the right (a count)
 *   hint     under the control while all is well
 *   error    takes the hint's place: the hint folds away, the
 *            error rises in out of a blur, the control shakes once
 *
 * Shared by input, textarea, password, search and select so the
 * whole family has one surface, one focus ring and one error.
 * ───────────────────────────────────────────────────────── */

export interface FieldProps {
  id: string;
  label?: React.ReactNode;
  /** Right side of the label row, e.g. a character count. */
  aside?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export type FieldSize = 'sm' | 'md';

/** The surface of a text control: a hairline that darkens on hover and turns to the ring on focus. */
export function fieldSurface({
  invalid,
  disabled,
  round = true,
}: {
  invalid?: boolean;
  disabled?: boolean;
  round?: boolean;
}) {
  const ring = invalid
    ? 'shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_55%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--danger),0_0_0_3px_color-mix(in_oklab,var(--danger)_14%,transparent)]'
    : 'shadow-[inset_0_0_0_1px_var(--border)] [&:not(:focus-within)]:hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_24%,var(--border))] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_oklab,var(--accent)_16%,transparent)]';
  return `relative flex w-full items-center bg-background text-foreground transition-[box-shadow,background-color,opacity] duration-200 ease-out ${round ? 'rounded-full' : 'rounded-md'} ${ring} ${
    disabled ? 'pointer-events-none opacity-50' : ''
  }`;
}

/** ids for the control's label, hint and error. */
export function useFieldIds(id?: string) {
  const auto = React.useId();
  const base = id ?? auto;
  return { id: base, hint: `${base}-hint`, error: `${base}-error` };
}

/** One short shake whenever `on` turns true (an error arrives). */
export function useShake<T extends HTMLElement>(on: boolean) {
  const ref = React.useRef<T>(null);
  const reduced = useInteractionReducedMotion();
  React.useEffect(() => {
    if (!on || reduced) return;
    ref.current?.animate(
      [
        { transform: 'none' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(-2px)' },
        { transform: 'none' },
      ],
      { duration: 380, easing: 'ease-out' },
    );
  }, [on, reduced]);
  return ref;
}

/** Sets a native input's value so React's onChange still fires (clear buttons, pickers). */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** A line under the control that folds open and closed; keeps its last words while closing. */
function Line({
  show,
  children,
  id,
  tone,
  reduced,
}: {
  show: boolean;
  children: React.ReactNode;
  id: string;
  tone: string;
  reduced: boolean;
}) {
  const [kept, setKept] = React.useState(children);
  if (show && children !== kept) setKept(children);
  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: show ? '1fr' : '0fr',
        transition: reduced ? 'none' : `grid-template-rows 320ms ${EASE_OUT}`,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <p
          id={id}
          className={`pt-2xs pl-sm text-caption ${tone}`}
          style={{
            opacity: show ? 1 : 0,
            filter: show ? 'blur(0px)' : 'blur(4px)',
            transform: show ? 'none' : 'translateY(-4px)',
            transition: reduced
              ? 'none'
              : show
                ? `opacity 280ms ${EASE_OUT} 60ms, filter 280ms ${EASE_OUT} 60ms, transform 380ms ${EASE_OUT}`
                : `opacity 140ms ${EASE_OUT}, filter 140ms ${EASE_OUT}, transform 200ms ${EASE_OUT}`,
          }}
        >
          {show ? children : kept}
        </p>
      </div>
    </div>
  );
}

export function Field({ id, label, aside, hint, error, required, className = '', children }: FieldProps) {
  const reduced = useInteractionReducedMotion();
  const ids = { hint: `${id}-hint`, error: `${id}-error` };
  return (
    <div className={`flex w-full flex-col ${className}`}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-sm px-sm pb-2xs">
          {label && (
            <label htmlFor={id} className="text-label text-foreground">
              {label}
              {required && (
                <span aria-hidden="true" className="ml-3xs text-muted-foreground">
                  *
                </span>
              )}
            </label>
          )}
          {aside && <span className="text-caption text-muted-foreground tabular-nums">{aside}</span>}
        </div>
      )}
      {children}
      <Line show={!error && !!hint} id={ids.hint} tone="text-muted-foreground" reduced={reduced}>
        {hint}
      </Line>
      <Line show={!!error} id={ids.error} tone="text-danger" reduced={reduced}>
        {error}
      </Line>
    </div>
  );
}

export default Field;
