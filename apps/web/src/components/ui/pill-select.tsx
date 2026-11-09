// Hairline UI · select · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { CaretDownIcon } from '@phosphor-icons/react';
import { THEME_TOKENS } from './floating.ts';
import { TextMorph } from './text-morph.tsx';
import { useInteractionReducedMotion } from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * PILL SELECT: a select that's the same surface as its pill
 *
 *   open      the pill grows into its list (size and corners
 *             ease) from the edge it's lined up with, while its
 *             label fades into the options; it opens upward when
 *             there's no room below, and long lists scroll
 *   pick      the list folds back into the pill and the label
 *             morphs to the new choice; the current option
 *             carries a drawn check
 *   keys      arrows move a highlight that glides between rows,
 *             Home and End jump, typing a few letters finds an
 *             option, Enter picks, Escape folds it back
 *
 * The list lives in a portal on the page's body, placed over
 * the pill, so a clipping toolbar, fold or scroller never cuts
 * it off; it carries the theme's colours with it. Scrolling
 * the page closes it.
 *
 * Used wherever a component needs a choice from a list; never
 * the browser's own dropdown, which can't follow the theme.
 * ───────────────────────────────────────────────────────── */

export interface PillOption {
  value: string;
  label: string;
  /** A second line in the list, e.g. a sample value. */
  description?: string;
}

export interface PillSelectProps {
  options: PillOption[];
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  /** Accessible name, e.g. "Column for Email". */
  label: string;
  /** Shown while nothing is chosen. */
  placeholder?: string;
  /** What the pill shows for a choice; the option's label by default. */
  display?: (option: PillOption | undefined) => string;
  /** The pill's contents, when it needs more than text (an icon that turns). */
  renderValue?: (option: PillOption | undefined, open: boolean) => React.ReactNode;
  /** Monospace labels, for code-like values (event names, column headers). */
  mono?: boolean;
  /** Which edge of the pill the list lines up with. */
  align?: 'start' | 'end';
  /** The list's width in px; never narrower than the pill (0 follows the pill). */
  width?: number;
  /** Fill the width it's given. */
  block?: boolean;
  /** Dims the pill's text, e.g. for "Don't import". */
  muted?: boolean;
  disabled?: boolean;
  /** "sm" is the compact pill for toolbars; "md" is the touch height of the other form fields. */
  size?: 'sm' | 'md';
  className?: string;
}

type Phase = 'closed' | 'opening' | 'open' | 'closing';

interface Fit {
  up: boolean;
  width: number;
  shift: number;
  x: number;
  y: number;
  theme: Record<string, string>;
}

const EASE = 'cubic-bezier(0.16,1,0.3,1)';
const DURATION = 420;
// rem, so the list follows the desk root size; ROW_* only estimate whether the list fits below the pill.
const MAX_LIST = 17.5;
const ROW = 2.25;
const ROW_WITH_DESCRIPTION = 3.25;
const PILL_SIZE = { sm: 'h-xl px-sm text-caption', md: 'h-touch pl-md pr-sm text-label' };
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

function Chevron({ up, reduced }: { up: boolean; reduced: boolean }) {
  return (
    <CaretDownIcon
      aria-hidden="true"
      className="size-icon-sm shrink-0 text-muted-foreground"
      style={{ transform: up ? 'rotate(180deg)' : 'none', transition: reduced ? 'none' : `transform 320ms ${EASE}` }}
    />
  );
}

export function PillSelect({
  options,
  value,
  onValueChange,
  label,
  placeholder = 'Choose',
  display,
  renderValue,
  mono = false,
  align = 'start',
  width = 0,
  block = false,
  muted = false,
  disabled = false,
  size = 'sm',
  className = '',
}: PillSelectProps) {
  const id = React.useId();
  const reduced = useInteractionReducedMotion();
  const [phase, setPhase] = React.useState<Phase>('closed');
  const [active, setActive] = React.useState(0);
  const [pill, setPill] = React.useState({ width: 0, height: 28 });
  const [panelHeight, setPanelHeight] = React.useState(0);
  const [fit, setFit] = React.useState<Fit>({ up: false, width, shift: 0, x: 0, y: 0, theme: {} });
  const [highlight, setHighlight] = React.useState({ top: 0, height: 0, ready: false });
  const [quiet, setQuiet] = React.useState(false);
  // A modal dialog sits in the top layer and makes the rest of the page inert, so a list portalled to the body inside one would be hidden and unclickable.
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const timer = React.useRef(0);
  const typed = React.useRef({ text: '', at: 0 });
  const selected = options.find((o) => o.value === value);
  const expanded = phase === 'open';
  const mounted = phase !== 'closed';
  const [prevPhase, setPrevPhase] = React.useState(phase);
  if (phase !== prevPhase) {
    setPrevPhase(phase);
    if (phase === 'closed') {
      setHighlight({ top: 0, height: 0, ready: false });
    }
  }
  const text = display ? display(selected) : (selected?.label ?? placeholder);

  const measureFit = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setHost(wrap.closest('dialog') ?? document.body);
    const rect = wrap.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = Math.min(Math.max(width, rect.width), vw - 24);
    // Lined up with the pill's edge, nudged back on screen.
    const shift = align === 'start' ? Math.min(0, vw - 12 - (rect.left + w)) : Math.max(0, 12 - (rect.right - w));
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const row = options.some((o) => o.description) ? ROW_WITH_DESCRIPTION : ROW;
    const estimate = (Math.min(MAX_LIST, options.length * row) + 0.75) * rem;
    const vh = window.innerHeight;
    const below = vh - 8 - rect.top;
    const above = rect.bottom - 8;
    const up = below < estimate + 8 && above > below;
    // Fixed coordinates of the pill's corner the list grows from.
    const x = align === 'start' ? rect.left : vw - rect.right;
    const y = up ? vh - rect.bottom : rect.top;
    const cs = getComputedStyle(wrap);
    const theme: Record<string, string> = { colorScheme: cs.colorScheme, fontFamily: cs.fontFamily };
    for (const t of THEME_TOKENS) {
      const v = cs.getPropertyValue(t);
      if (v) theme[t] = v;
    }
    setFit({ up, width: w, shift, x, y, theme });
  };

  const open = () => {
    if (disabled || phase === 'open' || phase === 'opening') return;
    window.clearTimeout(timer.current);
    measureFit();
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setPhase(reduced ? 'open' : 'opening');
  };

  const close = React.useCallback(
    (refocus = true) => {
      window.clearTimeout(timer.current);
      if (refocus) triggerRef.current?.focus({ preventScroll: true });
      if (reduced) return setPhase('closed');
      setPhase('closing');
      timer.current = window.setTimeout(() => setPhase('closed'), DURATION);
    },
    [reduced],
  );

  React.useEffect(() => {
    if (phase !== 'opening') return undefined;
    let inner = 0;
    const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setPhase('open'))));
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  React.useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return undefined;
    const measure = () =>
      setPill((p) =>
        p.width === trigger.offsetWidth && p.height === trigger.offsetHeight
          ? p
          : { width: trigger.offsetWidth, height: trigger.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(trigger);
    return () => observer.disconnect();
  }, []);

  // `mounted` re-measures once the portal exists; the panel ref is empty before it.
  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    setPanelHeight(panel.offsetHeight);
    // Grow the list to the longest label so a short pill never truncates its options.
    let extra = 0;
    for (const node of panel.querySelectorAll<HTMLElement>('[data-label]'))
      extra = Math.max(extra, node.scrollWidth - node.clientWidth);
    if (extra > 0)
      setFit((f) => ({ ...f, width: Math.min(f.width + extra, document.documentElement.clientWidth - 24) }));
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the ref is only filled after the render that sets `mounted`
  }, [mounted, options]);

  // The highlight glides to the active row, and the list scrolls to keep it in view.
  React.useLayoutEffect(() => {
    const row = rowRefs.current[active];
    const list = listRef.current;
    if (!row || !list) return;
    setHighlight((h) =>
      h.top === row.offsetTop && h.height === row.offsetHeight && h.ready === (h.ready || expanded)
        ? h
        : { top: row.offsetTop, height: row.offsetHeight, ready: h.ready || expanded },
    );
    const scroller = list.parentElement;
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      if (row.offsetTop < scroller.scrollTop) scroller.scrollTop = row.offsetTop - 4;
      else if (row.offsetTop + row.offsetHeight > scroller.scrollTop + scroller.clientHeight)
        scroller.scrollTop = row.offsetTop + row.offsetHeight - scroller.clientHeight + 4;
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `mounted` re-runs it once the rows exist
  }, [active, expanded, mounted]);

  React.useEffect(() => {
    if (expanded) listRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  React.useEffect(() => {
    if (!expanded) return undefined;
    const inside = (n: EventTarget | null) =>
      n instanceof Node && Boolean(wrapRef.current?.contains(n) || surfaceRef.current?.contains(n));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close(false);
    };
    // The list sits where the pill was; if the page moves under it, it goes at once rather than fold in the wrong place.
    const gone = () => {
      window.clearTimeout(timer.current);
      setPhase('closed');
    };
    const onScroll = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Node && surfaceRef.current?.contains(target))) gone();
    };
    const onResize = gone;
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [expanded, close]);

  const choose = (o: PillOption) => {
    close();
    if (o.value !== value) onValueChange(o.value);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, to)));
    };
    if (e.key === 'ArrowDown') move(active === last ? 0 : active + 1);
    else if (e.key === 'ArrowUp') move(active === 0 ? last : active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(last);
    else if (e.key === 'PageDown') move(active + 6);
    else if (e.key === 'PageUp') move(active - 6);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // A few letters typed quickly find the option that starts with them.
      const now = performance.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit !== -1) setActive(hit);
    }
  };

  const w = expanded ? fit.width : pill.width;
  const h = expanded ? panelHeight : pill.height;
  const listId = `${id}-list`;
  const pillText = renderValue ? null : (
    <>
      <span
        className={`min-w-0 flex-1 truncate text-left ${mono ? 'font-mono text-caption' : ''} ${muted || !selected ? 'text-muted-foreground' : 'text-foreground'}`}
      >
        {block ? text : <TextMorph>{text}</TextMorph>}
      </span>
      <Chevron up={expanded} reduced={reduced} />
    </>
  );

  return (
    <div
      ref={wrapRef}
      role="presentation"
      className={`relative ${block ? 'flex w-full min-w-0' : 'inline-flex'} ${className}`}
      onKeyDown={(e) => {
        setQuiet(false);
        if (e.key === 'Escape' && expanded) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      onBlur={(e) => {
        const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
        if (
          expanded &&
          document.hasFocus() &&
          !(to && (wrapRef.current?.contains(to) || surfaceRef.current?.contains(to)))
        )
          close(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={mounted ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? placeholder}`}
        disabled={disabled}
        onClick={() => (expanded ? close() : open())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open();
          }
        }}
        onPointerDown={() => setQuiet(true)}
        className={`inline-flex ${PILL_SIZE[size]} min-w-0 cursor-pointer items-center gap-xs rounded-full whitespace-nowrap shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-150 hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${block ? 'w-full' : ''} ${quiet ? 'outline-none' : FOCUS}`}
      >
        {renderValue ? renderValue(selected, expanded) : pillText}
      </button>

      {mounted &&
        host &&
        createPortal(
          <div
            ref={surfaceRef}
            role="presentation"
            data-floating-layer=""
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
            onPointerDown={(e) => {
              if (!(e.target instanceof Element && e.target.closest('[data-scroll]'))) e.preventDefault();
              setQuiet(true);
            }}
            className="fixed z-[60] overflow-hidden bg-background text-foreground"
            style={{
              ...fit.theme,
              [fit.up ? 'bottom' : 'top']: fit.y,
              [align === 'start' ? 'left' : 'right']:
                fit.x + (expanded ? (align === 'start' ? fit.shift : -fit.shift) : 0),
              width: w,
              height: h,
              borderRadius: expanded ? 'var(--radius-md)' : pill.height / 2,
              // The pill's own hairline, the whole way: it is the same surface.
              boxShadow: 'inset 0 0 0 1px var(--border)',
              transition: reduced
                ? 'none'
                : `width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}, left ${DURATION}ms ${EASE}, right ${DURATION}ms ${EASE}, border-radius ${DURATION}ms ${EASE}`,
            }}
          >
            {/* The pill's label, fading out as the surface grows and back in as it folds. */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inline-flex ${PILL_SIZE[size]} items-center gap-xs whitespace-nowrap ${fit.up ? 'bottom-0' : 'top-0'} ${align === 'start' ? 'left-0' : 'right-0'}`}
              style={{
                width: pill.width,
                opacity: expanded ? 0 : 1,
                transition: reduced ? 'none' : `opacity ${expanded ? 120 : 260}ms ${EASE} ${expanded ? 0 : 120}ms`,
              }}
            >
              {renderValue ? renderValue(selected, expanded) : pillText}
            </span>
            <div
              ref={panelRef}
              className={`absolute p-2xs ${fit.up ? 'bottom-0' : 'top-0'} ${align === 'start' ? 'left-0' : 'right-0'}`}
              style={{
                width: fit.width,
                opacity: expanded ? 1 : 0,
                transition: reduced ? 'none' : `opacity ${expanded ? 260 : 120}ms ${EASE} ${expanded ? 90 : 0}ms`,
              }}
            >
              <div
                data-scroll=""
                className="overflow-y-auto overscroll-contain"
                style={{ maxHeight: `${MAX_LIST}rem` }}
              >
                <div
                  ref={listRef}
                  id={listId}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a native <select> cannot follow the theme or grow out of the pill
                  role="listbox"
                  tabIndex={-1}
                  aria-label={label}
                  aria-activedescendant={`${id}-o${active}`}
                  onKeyDown={onListKey}
                  className="relative outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 rounded-sm bg-muted"
                    style={{
                      height: highlight.height,
                      transform: `translateY(${highlight.top}px)`,
                      opacity: highlight.ready ? 1 : 0,
                      transition:
                        highlight.ready && !reduced
                          ? `transform 260ms ${EASE}, height 260ms ${EASE}, opacity 200ms`
                          : 'none',
                    }}
                  />
                  {options.map((o, i) => {
                    const on = o.value === value;
                    return (
                      // Keys are handled by the listbox (aria-activedescendant); the rows are the pointer targets.
                      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- see above
                      <div
                        key={o.value}
                        ref={(el) => {
                          rowRefs.current[i] = el;
                        }}
                        id={`${id}-o${i}`}
                        tabIndex={-1}
                        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- <option> cannot hold a description or the drawn check
                        role="option"
                        aria-selected={on}
                        onPointerMove={() => setActive(i)}
                        onClick={() => choose(o)}
                        className="relative flex cursor-pointer items-start gap-xs rounded-sm px-sm py-xs"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            data-label=""
                            className={`block truncate ${mono ? 'font-mono text-caption' : 'text-label'}`}
                          >
                            {o.label}
                          </span>
                          {o.description && (
                            <span data-label="" className="mt-3xs block truncate text-caption text-muted-foreground">
                              {o.description}
                            </span>
                          )}
                        </span>
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                          className="mt-3xs size-icon-sm shrink-0"
                        >
                          <path
                            d="M3.5 8.5 6.5 11.5 12.5 4.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            pathLength={1}
                            strokeDasharray={1}
                            style={{
                              strokeDashoffset: on && expanded ? 0 : 1,
                              transition: reduced ? 'none' : `stroke-dashoffset 380ms ${EASE} 160ms`,
                            }}
                          />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          host,
        )}
    </div>
  );
}
