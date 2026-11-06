// Hairline UI components, MIT License. Copyright (c) 2026 Hairline UI.
// https://hairlineui.com/license#components
// Adapted from the `tabs` registry item: pills only, and no panels of its own (a zone page renders the tabpanel, because
// the URL decides which tab shows), with the sizes and colors mapped onto the app tokens.
'use client';

import * as React from 'react';
import { NumberRoll } from './number-roll.tsx';
import { EASE_OUT, EASE_THROW, INTERACTION_FOCUS, useInteractionReducedMotion } from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * TABS: views of one thing, side by side
 *
 *   pick     the pill is thrown to the new tab while its width
 *            eases to the label
 *   count    a tab's count rolls when it changes
 *   keys     arrows move and select, Home/End jump; the tablist
 *            scrolls the chosen tab into view on narrow screens
 * ───────────────────────────────────────────────────────── */

export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name of the tablist. */
  label: string;
  /** Shared with the panel: the tabs are `<id>-tab-<value>` and each one controls `<id>-panel`. */
  id: string;
  className?: string;
}

export function Tabs({ items, value, onValueChange, label, id, className = '' }: TabsProps) {
  const reduced = useInteractionReducedMotion();
  const listRef = React.useRef<HTMLDivElement>(null);
  const [mark, setMark] = React.useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab="${CSS.escape(value)}"]`);
      if (!el) {
        setMark(null);
        return;
      }
      const next = { x: el.offsetLeft, w: el.offsetWidth };
      setMark((previous) => (previous && previous.x === next.x && previous.w === next.w ? previous : next));
      // Keep the chosen tab in view inside the scrolling strip, never scrolling the page.
      const strip = list.parentElement;
      if (strip && strip.scrollWidth > strip.clientWidth) {
        const left = el.offsetLeft - 16;
        const right = el.offsetLeft + el.offsetWidth + 16 - strip.clientWidth;
        if (strip.scrollLeft > left) strip.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
        else if (strip.scrollLeft < right) strip.scrollTo({ left: right, behavior: reduced ? 'auto' : 'smooth' });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, reduced]);

  // The pill appears where the chosen tab is before it ever moves.
  React.useEffect(() => {
    if (!mark || ready) return undefined;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [mark, ready]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const enabled = items.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.value === value);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    event.preventDefault();
    onValueChange(target.value);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(target.value)}"]`)?.focus();
  };

  return (
    <div className={`min-w-0 [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden ${className}`}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="relative flex w-max items-center rounded-full bg-surface p-3xs shadow-[inset_0_0_0_1px_var(--border)]"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-3xs bottom-3xs left-0 rounded-full bg-primary"
          style={{
            transform: `translateX(${mark?.x ?? 0}px)`,
            width: mark?.w ?? 0,
            opacity: mark ? 1 : 0,
            transition:
              reduced || !ready
                ? 'none'
                : `transform 440ms ${EASE_THROW}, width 400ms ${EASE_OUT}, opacity 200ms ${EASE_OUT}`,
          }}
        />
        {items.map((item) => {
          const on = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${id}-tab-${item.value}`}
              aria-selected={on}
              aria-controls={`${id}-panel`}
              tabIndex={on ? 0 : -1}
              disabled={item.disabled}
              data-tab={item.value}
              onClick={() => onValueChange(item.value)}
              onKeyDown={onKeyDown}
              className={`relative z-10 flex h-touch shrink-0 cursor-pointer items-center gap-xs rounded-full px-lg text-label whitespace-nowrap transition-colors duration-200 disabled:cursor-default disabled:opacity-40 [&_svg]:size-icon-sm ${
                on ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              } ${INTERACTION_FOCUS}`}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span
                  className={`rounded-full px-xs text-caption tabular-nums transition-colors duration-200 ${
                    on ? 'bg-primary-foreground/20' : 'bg-muted'
                  }`}
                >
                  <NumberRoll value={item.count} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
