// Hairline UI · password-input · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { IconMorph } from './icon-morph.tsx';
import { Input, type InputProps } from './input.tsx';
import { TextMorph } from './text-morph.tsx';
import {
  EASE_OUT,
  INTERACTION_FOCUS,
  INTERACTION_PRESS,
  useInteractionReducedMotion,
} from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * PASSWORD INPUT: show, measure, warn
 *
 *   show     the eye turns into eye-off (rotate morph) and the
 *            dots become letters; focus stays in the field
 *   measure  with `strength`, four segments fill left to right
 *            as the score climbs and the word morphs
 *            (Weak → Fair → Good → Strong)
 *   warn     Caps Lock on while typing folds a note in under it
 * ───────────────────────────────────────────────────────── */

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'trailing' | 'clearable'> {
  /** Show the four-segment meter. Pass a function to score it yourself (e.g. zxcvbn). */
  strength?: boolean | ((value: string) => PasswordScore);
  /** Words for scores 1 to 4. */
  strengthLabels?: [string, string, string, string];
  /** The note shown while Caps Lock is on. */
  capsLockHint: string;
  /** Accessible names of the eye button, in the caller's language (the upstream defaults were English). */
  showLabel: string;
  hideLabel: string;
  /** Whether the password shows as text, controlled or not. */
  shown?: boolean;
  defaultShown?: boolean;
  onShownChange?: (shown: boolean) => void;
}

/** A plain score: length and variety. Swap in zxcvbn for real checks. */
export function scorePassword(value: string): PasswordScore {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  return Math.max(1, Math.min(4, score)) as PasswordScore;
}

const TONES = ['bg-danger', 'bg-muted-foreground', 'bg-success', 'bg-success'];
const TEXT = ['text-danger ', 'text-muted-foreground ', 'text-success ', 'text-success '];

export function PasswordInput({
  strength,
  strengthLabels,
  capsLockHint,
  showLabel,
  hideLabel,
  hint,
  value,
  defaultValue,
  onValueChange,
  onKeyDown,
  onKeyUp,
  onBlur,
  size = 'md',
  shown: shownProp,
  defaultShown = false,
  onShownChange,
  ...props
}: PasswordInputProps) {
  const reduced = useInteractionReducedMotion();
  const [ownShown, setOwnShown] = React.useState(defaultShown);
  const shown = shownProp ?? ownShown;
  const [text, setText] = React.useState(String(defaultValue ?? ''));
  const [caps, setCaps] = React.useState(false);
  const current = value !== undefined ? String(value) : text;
  const score: PasswordScore =
    !strength || !current ? 0 : typeof strength === 'function' ? strength(current) : scorePassword(current);
  const readCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="flex w-full flex-col">
      <Input
        {...props}
        size={size}
        type={shown ? 'text' : 'password'}
        autoComplete={props.autoComplete ?? 'current-password'}
        value={value}
        defaultValue={defaultValue}
        hint={caps ? capsLockHint : hint}
        onValueChange={(v) => {
          if (value === undefined) setText(v);
          onValueChange?.(v);
        }}
        onKeyDown={(e) => {
          readCaps(e);
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          readCaps(e);
          onKeyUp?.(e);
        }}
        onBlur={(e) => {
          setCaps(false);
          onBlur?.(e);
        }}
        trailing={
          <button
            type="button"
            aria-label={shown ? hideLabel : showLabel}
            aria-pressed={shown}
            // Keep focus (and the caret) in the field.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              if (shownProp === undefined) setOwnShown(!shown);
              onShownChange?.(!shown);
            }}
            className={`flex cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground ${size === 'sm' ? 'size-5' : 'size-7'} ${INTERACTION_PRESS} ${INTERACTION_FOCUS}`}
          >
            <IconMorph size={14} mode="rotate" active={shown} from={<EyeIcon />} to={<EyeSlashIcon />} />
          </button>
        }
      />
      {strength && (
        <div className="flex items-center gap-sm px-sm pt-xs" aria-live="polite">
          <div className="flex flex-1 gap-2xs" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span key={step} className="relative h-[0.25rem] flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={`absolute inset-0 origin-left rounded-full ${TONES[Math.max(0, score - 1)]}`}
                  style={{
                    transform: score >= step ? 'scaleX(1)' : 'scaleX(0)',
                    transition: reduced
                      ? 'none'
                      : `transform 420ms ${EASE_OUT} ${score >= step ? (step - 1) * 50 : 0}ms, background-color 300ms`,
                  }}
                />
              </span>
            ))}
          </div>
          <span
            className={`w-[3rem] text-right text-[12px] font-medium ${score ? TEXT[score - 1] : 'text-muted-foreground'}`}
          >
            <TextMorph>{score && strengthLabels ? strengthLabels[score - 1] : ' '}</TextMorph>
          </span>
        </div>
      )}
    </div>
  );
}

export default PasswordInput;
