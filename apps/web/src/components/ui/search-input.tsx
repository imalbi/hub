// Hairline UI · search-input · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Input, type InputProps } from './input.tsx';
import { EASE_OUT, interactionIcon, useInteractionReducedMotion } from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * SEARCH INPUT: the field at the top of every list
 *
 *   shortcut  a ⌘K (or "/") hint sits at the end; the key
 *             focuses the field from anywhere on the page, and
 *             the hint steps aside once you type
 *   search    onSearch runs after a pause in typing (debounced);
 *             Enter runs it at once, Escape clears and leaves
 *   loading   the magnifier blurs into a spinner and back
 *   clear     the clear button folds in with the first letter
 * ───────────────────────────────────────────────────────── */

export interface SearchInputProps extends Omit<InputProps, 'leading' | 'type' | 'clearable'> {
  /** Called with the query after `debounce` ms without typing, and at once on Enter. */
  onSearch?: (query: string) => void;
  debounce?: number;
  /** Shows a spinner in place of the magnifier. */
  loading?: boolean;
  /** "/" (the default), "mod+k" (⌘K / Ctrl K) or null for no shortcut. Ctrl K belongs to the command palette. */
  shortcut?: 'mod+k' | '/' | null;
}

const subscribeNoop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

export function SearchInput({
  onSearch,
  debounce = 250,
  loading = false,
  shortcut = '/',
  placeholder = 'Search',
  value,
  defaultValue,
  onValueChange,
  onKeyDown,
  onFocus,
  onBlur,
  size = 'md',
  ref,
  ...props
}: SearchInputProps) {
  const reduced = useInteractionReducedMotion();
  const inner = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(String(defaultValue ?? ''));
  const [focused, setFocused] = React.useState(false);
  const current = value !== undefined ? String(value) : text;
  const mac = React.useSyncExternalStore(subscribeNoop, isMac, () => true);
  const searchRef = React.useRef(onSearch);
  React.useEffect(() => {
    searchRef.current = onSearch;
  });

  // Debounced search: each keystroke restarts the wait.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = window.setTimeout(() => searchRef.current?.(current), debounce);
    return () => window.clearTimeout(timer);
  }, [current, debounce]);

  // The shortcut focuses the field from anywhere, unless you're typing somewhere else.
  React.useEffect(() => {
    if (!shortcut) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const hit = shortcut === '/' ? e.key === '/' && !typing : e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
      if (!hit) return;
      e.preventDefault();
      inner.current?.focus();
      inner.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const showKey = !!shortcut && !focused && !current;
  const keyLabel = shortcut === '/' ? '/' : mac ? '⌘K' : 'Ctrl K';

  return (
    <Input
      {...props}
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      type="search"
      size={size}
      clearable
      placeholder={placeholder}
      value={value}
      defaultValue={defaultValue}
      inputClassName="[&::-webkit-search-cancel-button]:appearance-none"
      onValueChange={(v) => {
        if (value === undefined) setText(v);
        onValueChange?.(v);
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === 'Enter') onSearch?.(current);
        if (e.key === 'Escape' && current) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      leading={
        <span className="relative size-icon-sm" aria-hidden="true">
          <span
            className="absolute inset-0 flex items-center justify-center"
            style={interactionIcon(!loading, reduced)}
          >
            <MagnifyingGlassIcon className="size-icon-sm" />
          </span>
          <span className="absolute inset-0 flex items-center justify-center" style={interactionIcon(loading, reduced)}>
            <span
              className={`size-sm rounded-full border-[1.5px] border-current border-t-transparent ${loading ? 'animate-spin' : ''}`}
            />
          </span>
        </span>
      }
      trailing={
        shortcut ? (
          <span
            className="grid"
            style={{
              gridTemplateColumns: showKey ? '1fr' : '0fr',
              transition: reduced ? 'none' : `grid-template-columns 320ms ${EASE_OUT}`,
            }}
          >
            <span className="min-w-0 overflow-hidden">
              <kbd
                aria-hidden="true"
                className="mr-xs block rounded-full px-xs font-mono text-caption whitespace-nowrap text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                style={{
                  opacity: showKey ? 1 : 0,
                  filter: showKey ? 'none' : 'blur(3px)',
                  transition: reduced ? 'none' : `opacity 200ms ${EASE_OUT}, filter 200ms ${EASE_OUT}`,
                }}
              >
                {keyLabel}
              </kbd>
            </span>
          </span>
        ) : undefined
      }
    />
  );
}

export default SearchInput;
