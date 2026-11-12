// Hairline UI · stepper-input · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { fieldSurface } from './field.tsx';
import { NumberRoll } from './number-roll.tsx';

/* ─────────────────────────────────────────────────────────
 * STEPPER INPUT: a tactile number control with acceleration
 *
 *   single tap   increments or decrements by step, rolling
 *                the odometer in the direction of travel
 *   holding      waits 300ms, then accelerates smoothly from
 *                100ms down to 30ms intervals with scaled steps
 *   boundary     hitting min or max bounds disables the action
 *                and gives the container an elastic bumper shake
 *   direct edit  clicking the number reveals an exact input,
 *                committing on blur or Enter, cancelling on Escape
 * ───────────────────────────────────────────────────────── */

export interface StepperInputProps {
  /** Controlled value; `undefined` means unset and shows `placeholder` until the first step or typed number. */
  value: number | undefined;
  onValueChange: (value: number) => void;
  /** Accessible name of the group; use `labelledBy` instead when a label sits outside. */
  label?: string;
  /** id of the element that names the group. */
  labelledBy?: string;
  /** id of the element that describes the group (a hint or an error). */
  describedBy?: string;
  /** Accessible name of the minus button (upstream: "Decrease <label>"). */
  decreaseLabel: string;
  /** Accessible name of the plus button (upstream: "Increase <label>"). */
  increaseLabel: string;
  /** Shown while the value is unset. */
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Large step for PageUp/PageDown and prolonged acceleration. Defaults to step * 10. */
  largeStep?: number;
  /** Optional unit appended to the number, e.g. "px", "%", "seats". */
  unit?: string;
  /** Format options passed to NumberRoll when not editing. */
  format?: Intl.NumberFormatOptions;
  disabled?: boolean;
  name?: string;
  className?: string;
}

const reducedQuery = '(prefers-reduced-motion: reduce)';
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );

const shake = (el: HTMLElement | null, reduced: boolean) => {
  if (!el || reduced) return;
  el.animate(
    [
      { transform: 'none' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(-1.5px)' },
      { transform: 'none' },
    ],
    { duration: 280, easing: 'ease-out', composite: 'add' },
  );
};

export function StepperInput({
  value: currentVal,
  onValueChange,
  label,
  labelledBy,
  describedBy,
  decreaseLabel,
  increaseLabel,
  placeholder,
  min = -Infinity,
  max = Infinity,
  step = 1,
  largeStep,
  unit,
  format,
  disabled = false,
  name,
  className = '',
}: StepperInputProps) {
  const reduced = useReducedMotion();
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState(currentVal === undefined ? '' : String(currentVal));

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const holdTimerRef = React.useRef<number | null>(null);
  const holdIntervalRef = React.useRef<number | null>(null);
  const holdStartRef = React.useRef<number>(0);

  const effectiveLargeStep = largeStep ?? step * 10;
  const atMin = currentVal !== undefined && currentVal <= min;
  const atMax = currentVal !== undefined && currentVal >= max;

  const clamp = React.useCallback(
    (n: number) => {
      let rounded = Math.round(n / step) * step;
      // Fix floating point precision, e.g. 0.1 + 0.2
      const stepDecimals = (step.toString().split('.')[1] || '').length;
      if (stepDecimals > 0) {
        rounded = Number(rounded.toFixed(stepDecimals));
      }
      return Math.min(max, Math.max(min, rounded));
    },
    [min, max, step],
  );

  const updateVal = React.useCallback(
    (nextRaw: number) => {
      const next = clamp(nextRaw);
      if (next === currentVal) {
        shake(rootRef.current, reduced);
        return false;
      }
      onValueChange(next);
      return true;
    },
    [clamp, currentVal, onValueChange, reduced],
  );

  const stopHold = React.useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const stepDelta = React.useCallback(
    (dir: 1 | -1, multiplier = 1) => {
      // The first step from an unset value lands on the lowest allowed one (or 0).
      if (currentVal === undefined) return updateVal(Number.isFinite(min) ? min : 0);
      return updateVal(currentVal + step * multiplier * dir);
    },
    [currentVal, min, step, updateVal],
  );

  const startHold = React.useCallback(
    (dir: 1 | -1) => {
      if (disabled) return;
      stopHold();

      // Immediate first step
      const canMove = stepDelta(dir, 1);
      if (!canMove) return;

      holdStartRef.current = Date.now();

      // 300ms initial pause before rapid firing
      holdTimerRef.current = window.setTimeout(() => {
        const tick = () => {
          const elapsed = Date.now() - holdStartRef.current;
          let mult = 1;
          let intervalTime = 90;

          if (elapsed > 2400) {
            mult = Math.max(1, Math.round(effectiveLargeStep / step));
            intervalTime = 30;
          } else if (elapsed > 1200) {
            mult = Math.max(1, Math.round(effectiveLargeStep / step / 2));
            intervalTime = 55;
          }

          const ok = stepDelta(dir, mult);
          if (!ok) {
            stopHold();
            return;
          }

          holdIntervalRef.current = window.setTimeout(tick, intervalTime);
        };
        tick();
      }, 300);
    },
    [disabled, effectiveLargeStep, step, stepDelta, stopHold],
  );

  React.useEffect(() => {
    return () => stopHold();
  }, [stopHold]);

  const commitEdit = React.useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(editText);
    if (!Number.isNaN(parsed)) {
      updateVal(parsed);
    } else {
      setEditText(currentVal === undefined ? '' : String(currentVal));
    }
  }, [currentVal, editText, updateVal]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepDelta(1, 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepDelta(-1, 1);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      updateVal((currentVal ?? 0) + effectiveLargeStep);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      updateVal((currentVal ?? 0) - effectiveLargeStep);
    } else if (e.key === 'Home' && min !== -Infinity) {
      e.preventDefault();
      updateVal(min);
    } else if (e.key === 'End' && max !== Infinity) {
      e.preventDefault();
      updateVal(max);
    } else if (editing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(false);
        setEditText(currentVal === undefined ? '' : String(currentVal));
      }
    }
  };

  const btn =
    'flex aspect-square h-full items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30 cursor-pointer disabled:cursor-default touch-manipulation';
  const holdHandlers = (dir: 1 | -1) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      startHold(dir);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}
      stopHold();
    },
    onPointerCancel: stopHold,
  });

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the group owns arrow, Page and Home/End navigation, like a spinbutton
    <div
      ref={rootRef}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a themed pill holding two buttons and the value: a fieldset cannot be styled as one control
      role="group"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className={`${fieldSurface({ disabled })} h-touch p-3xs text-body outline-none select-none sm:text-label ${className}`}
    >
      {/* Hidden input for HTML form submissions */}
      {name && currentVal !== undefined && <input type="hidden" name={name} value={currentVal} />}

      <button
        type="button"
        tabIndex={-1}
        aria-label={decreaseLabel}
        disabled={disabled || atMin}
        className={btn}
        {...holdHandlers(-1)}
      >
        <MinusIcon className="size-icon-sm" aria-hidden="true" />
      </button>

      {/* Value Display / Direct Edit */}
      {/* oxlint-disable-next-line click-events-have-key-events, no-static-element-interactions -- a press opens the exact input; arrows on the group reach it and the field takes over on focus */}
      <div
        className="relative flex min-w-2xl flex-1 cursor-text items-center justify-center px-xs text-foreground tabular-nums"
        onClick={() => {
          if (disabled || editing) return;
          setEditing(true);
          setEditText(currentVal === undefined ? '' : String(currentVal));
          setTimeout(() => inputRef.current?.select(), 10);
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode={step % 1 === 0 ? 'numeric' : 'decimal'}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            aria-label={label}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            className="w-full [appearance:textfield] bg-transparent text-center text-foreground outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the input exists only because the user just asked to type a value
            autoFocus
          />
        ) : currentVal === undefined ? (
          <span className="flex items-baseline gap-2xs text-muted-foreground/70">
            {placeholder}
            {placeholder && unit && <span className="text-caption">{unit}</span>}
          </span>
        ) : (
          <div className="flex items-baseline gap-2xs" aria-hidden="true">
            <NumberRoll value={currentVal} format={format} duration={260} />
            {unit && <span className="text-caption text-muted-foreground">{unit}</span>}
          </div>
        )}

        {/* Screen reader live value */}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an <output> would join the form; this is a live region only */}
        <span className="sr-only" role="status" aria-live="polite">
          {currentVal === undefined ? '' : `${currentVal} ${unit ?? ''}`}
        </span>
      </div>

      <button
        type="button"
        tabIndex={-1}
        aria-label={increaseLabel}
        disabled={disabled || atMax}
        className={btn}
        {...holdHandlers(1)}
      >
        <PlusIcon className="size-icon-sm" aria-hidden="true" />
      </button>
    </div>
  );
}
