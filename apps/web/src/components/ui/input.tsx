// Hairline UI · input · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { XIcon } from '@phosphor-icons/react';
import { Field, fieldSurface, setNativeValue, useFieldIds, useShake, type FieldSize } from './field.tsx';
import { EASE_OUT, INTERACTION_FOCUS, interactionIcon, useInteractionReducedMotion } from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * INPUT: a one-line field
 *
 *   rest     a hairline pill; hover darkens the line
 *   focus    the line turns to the ring with a 3px halo
 *   typing   a clear button folds in once there is text and
 *            folds away when it's gone (it hands focus back)
 *   error    the line turns red, the hint gives way to the
 *            error and the field shakes once
 * ───────────────────────────────────────────────────────── */

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Shows red and replaces the hint. */
  error?: React.ReactNode;
  /** An icon or text before the value. */
  leading?: React.ReactNode;
  /** An icon, text or button after the value. */
  trailing?: React.ReactNode;
  /** A button that empties the field once it has text. */
  clearable?: boolean;
  /** Accessible name of the clear button. */
  clearLabel?: string;
  /** Compact (2rem) or touch height. */
  size?: FieldSize;
  /** Called with the new text on every change. */
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLInputElement>;
  /** Class for the outer column. */
  className?: string;
  /** Class for the input element itself. */
  inputClassName?: string;
}

export function Input({
  label,
  hint,
  error,
  leading,
  trailing,
  clearable,
  clearLabel = 'Clear',
  size = 'md',
  onValueChange,
  ref,
  id,
  className = '',
  inputClassName = '',
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  ...props
}: InputProps) {
  const reduced = useInteractionReducedMotion();
  const ids = useFieldIds(id);
  const inner = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(String(defaultValue ?? ''));
  const current = value !== undefined ? String(value) : text;
  const shakeRef = useShake<HTMLDivElement>(!!error);
  const sm = size === 'sm';
  const showClear = !!clearable && current.length > 0 && !disabled;

  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const describedBy =
    [hint && !error ? ids.hint : null, error ? ids.error : null].filter(Boolean).join(' ') || undefined;

  return (
    <Field id={ids.id} label={label} hint={hint} error={error} required={required} className={className}>
      <div
        ref={shakeRef}
        className={`${fieldSurface({ invalid: !!error, disabled })} ${sm ? 'h-xl text-body sm:text-label' : 'h-touch text-body sm:text-label'}`}
      >
        {leading && (
          <span
            className={`flex shrink-0 items-center text-muted-foreground ${sm ? 'pl-sm' : 'pl-md'} [&_svg]:size-icon-sm`}
          >
            {leading}
          </span>
        )}
        <input
          ref={setRefs}
          id={ids.id}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            if (value === undefined) setText(e.target.value);
            onChange?.(e);
            onValueChange?.(e.target.value);
          }}
          className={`h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70 ${leading ? 'pl-xs' : sm ? 'pl-sm' : 'pl-md'} ${trailing || clearable ? 'pr-2xs' : sm ? 'pr-sm' : 'pr-md'} ${inputClassName}`}
          {...props}
        />
        {clearable && (
          // The clear button folds its own width open, so the text never jumps.
          <span
            className="grid shrink-0"
            style={{
              gridTemplateColumns: showClear ? '1fr' : '0fr',
              transition: reduced ? 'none' : `grid-template-columns 320ms ${EASE_OUT}`,
            }}
          >
            <span className="min-w-0 overflow-hidden">
              <button
                type="button"
                tabIndex={showClear ? 0 : -1}
                aria-hidden={!showClear}
                aria-label={clearLabel}
                onClick={() => {
                  if (!inner.current) return;
                  setNativeValue(inner.current, '');
                  inner.current.focus();
                }}
                className={`mr-2xs flex cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${sm ? 'size-icon' : 'size-xl'} ${INTERACTION_FOCUS}`}
                style={interactionIcon(showClear, reduced)}
              >
                <XIcon className="size-icon-sm" aria-hidden="true" />
              </button>
            </span>
          </span>
        )}
        {trailing && (
          <span
            className={`flex shrink-0 items-center text-muted-foreground ${sm ? 'pr-2xs' : 'pr-xs'} [&_svg]:size-icon-sm`}
          >
            {trailing}
          </span>
        )}
      </div>
    </Field>
  );
}

export default Input;
