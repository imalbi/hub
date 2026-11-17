// Hairline UI · command-palette · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

import * as React from 'react';
import { CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Badge } from './badge.tsx';
import { Kbd } from './kbd.tsx';
import { TextMorph } from './text-morph.tsx';

/* ─────────────────────────────────────────────────────────
 * COMMAND PALETTE: Ctrl K, from the pill that was always there
 *
 *   closed    a quiet "Search… Ctrl K" pill
 *   opening   the pill itself lifts and grows into the palette:
 *             position, size and corners ease from pill to panel
 *             while its placeholder becomes the field's
 *   search    results narrow as you type, the letters that match
 *             are marked, the panel's height eases to fit and a
 *             highlight glides between rows
 *   nested    "Change theme…" opens its own list in place: it
 *             slides in from the right as a chip joins the field;
 *             Backspace slides back
 *   page      an item with a `view` opens that content in place of
 *             the list (a form, a hold to confirm), same chip and
 *             the same way back
 *   running   a command's shortcut blurs into a spinner, then a
 *             check that draws itself, and the palette folds back
 *             into the pill, which it lands as exactly (hotkey
 *             and all), so the hand-off never shows
 *   empty     "No results for “xyz”", morphing as you type
 *
 * A real modal dialog: focus moves in and back, arrow keys,
 * Home/End, Enter, Escape (back, then close) and the hotkey to
 * toggle.
 *
 * Edited for Hub (generated code is ours): native <dialog> in place
 * of the fixed div (a Select inside a page portals into it), tokens
 * and rem for every size (the desk scales the root font size), Phosphor
 * icons, our Kbd, every sentence a prop in Italian, `view` pages, a
 * generic failure line, a late answer from an old session is ignored,
 * and no `href` (the caller navigates with its router). Escape never
 * clears the query, it goes back or closes.
 * ───────────────────────────────────────────────────────── */

export interface CommandViewApi {
  /** Return to the list this page was opened from. */
  back: () => void;
}

export interface CommandItem {
  id: string;
  label: string;
  /** Rows are grouped under this heading, in the order groups first appear. */
  group?: string;
  icon?: React.ReactNode;
  /** Other words that should find it, e.g. ["dark", "light"] for "Change theme". */
  keywords?: string[];
  /** A short muted word after the label. */
  note?: string;
  /** Muted text at the right edge, e.g. where the action lives. */
  meta?: string;
  /** Hub: a muted line under the label (a record's context); the row is then taller. */
  detail?: string;
  /** Hub: outline chips at the right edge, before `meta`. */
  badges?: string[];
  /** Hub: the caller already matched this row (a record found by the server), so the query never hides it. */
  always?: boolean;
  /** Hub: shown at the right of this row's group heading (the first row that has one wins): a count and a link. */
  groupAside?: { text: string; link?: { label: string; onSelect: () => void } };
  /** Run it. Return a promise to show progress on the row before the palette closes; a rejection shakes the row. */
  onSelect?: () => void | Promise<unknown>;
  /** A nested list, opened in place (e.g. "Change theme…"). */
  items?: CommandItem[];
  /** A page opened in place of the list (a form, a hold to confirm); the label is its chip. */
  view?: (api: CommandViewApi) => React.ReactNode;
}

export interface CommandPaletteCopy {
  dialog: string;
  search: string;
  list: string;
  /** The pill's words. */
  triggerLabel: string;
  /** The pill's accessible name. */
  triggerName: string;
  escape: string;
  move: string;
  open: string;
  back: string;
  pending: string;
  failed: string;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  copy: CommandPaletteCopy;
  /** What the list says when nothing matches the query. */
  emptyText: (query: string) => string;
  /** The letter that opens it with Ctrl. Empty string turns the hotkey off. */
  hotkey?: string;
  onOpenChange?: (open: boolean) => void;
  /** Hub: every change of the query, and '' when the palette starts over. */
  onQueryChange?: (query: string) => void;
  /** Hub: with a query and rows elsewhere but none under `heading`, that heading stays at the end with `text`. */
  emptyGroup?: { heading: string; text: (query: string) => string };
  className?: string;
  /** Hub: `rail` is a round icon button (the caption under it is the caller's); the panel grows out of it but opens centred near the top of the screen. */
  trigger?: 'pill' | 'rail';
}

type Phase = 'closed' | 'opening' | 'open' | 'closing';
type Page = { title: string; items?: CommandItem[]; view?: CommandItem['view'] };
type Row = { item: CommandItem; marks: number[]; score: number };
type Rect = { left: number; top: number; width: number; height: number; radius: number };
type RunState = { id: string; state: 'pending' | 'done' | 'error' };

const EASE = 'cubic-bezier(0.16,1,0.3,1)';
const DURATION = 440;
// Sizes in rem, so the desk's root font size scales the palette with everything else. Width is the dialog-md token.
const WIDTH = 32.5;
const ROW = 2.5;
// A row with a detail line (a record): title and detail on two lines.
const DETAIL_ROW = 3.5;
const HEADER = 3.25;
const FOOTER = 2.3125;
const LIST_PAD = 0.75;
const LIST_MAX = 22;
// Records make a taller list: three groups of two or three rows should not scroll at once.
const LIST_MAX_RECORDS = 36;
const RADIUS = 1.25;
const FOCUS = 'focus-visible:outline focus-visible:outline-accent';

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

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/** Icons trade places through a blur: the old one shrinks away as the new one grows in. */
const swap = (on: boolean, reduced: boolean): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'scale(0.6)',
  filter: on ? 'none' : 'blur(3px)',
  transition: reduced ? 'none' : `opacity 220ms ${EASE}, transform 340ms ${EASE}, filter 220ms ${EASE}`,
});

/** Where the query's letters land in the text: one run if it's there whole, otherwise in order. */
function match(text: string, query: string): number[] | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const at = t.indexOf(q);
  if (at >= 0) return Array.from({ length: q.length }, (_, i) => at + i);
  const marks: number[] = [];
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (q[j] === ' ') j++;
    if (t[i] === q[j]) {
      marks.push(i);
      j++;
    }
  }
  return j >= q.length ? marks : null;
}

function rank(items: CommandItem[], query: string): Row[] {
  const q = query.trim();
  if (!q) return items.map((item) => ({ item, marks: [], score: 0 }));
  const rows: Row[] = [];
  for (const item of items) {
    const marks = match(item.label, q);
    if (item.always) {
      rows.push({ item, marks: [], score: 0 });
    } else if (marks) {
      const contiguous = marks.length > 1 && marks[marks.length - 1] - marks[0] === marks.length - 1;
      const start = marks[0] ?? 0;
      const wordStart = start === 0 || item.label[start - 1] === ' ';
      const score =
        (contiguous ? 60 : 30) + (start === 0 ? 40 : wordStart ? 20 : 0) - (marks[marks.length - 1] - start) * 0.5;
      rows.push({ item, marks, score });
    } else if (item.keywords?.some((k) => match(k, q))) {
      rows.push({ item, marks: [], score: 10 });
    }
  }
  // Groups keep the order they have in `items` (records, Vai a, Azioni); the score orders rows inside a group.
  const order = new Map<string | undefined, number>();
  for (const item of items) if (!order.has(item.group)) order.set(item.group, order.size);
  const at = (row: Row) => order.get(row.item.group) ?? 0;
  return rows.sort((a, b) => at(a) - at(b) || b.score - a.score);
}

function Marked({ text, marks }: { text: string; marks: number[] }) {
  if (!marks.length) return <>{text}</>;
  const set = new Set(marks);
  return (
    <>
      {Array.from(text).map((ch, i) =>
        set.has(i) ? (
          <span key={i} className="text-foreground">
            {ch}
          </span>
        ) : (
          <React.Fragment key={i}>{ch}</React.Fragment>
        ),
      )}
    </>
  );
}

/** The pill's face. The trigger draws it, and so does the palette as it grows out of the pill and folds back, so the hand-off changes nothing. */
function PillFace({ label }: { label: string }) {
  return (
    <>
      <MagnifyingGlassIcon aria-hidden="true" className="size-icon-sm shrink-0" />
      <span className="pr-lg">{label}</span>
      <span className="flex items-center gap-3xs">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </span>
    </>
  );
}

function Check({ drawn, reduced }: { drawn: boolean; reduced: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-icon-sm">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        style={{
          strokeDashoffset: drawn ? 0 : 1,
          transition: drawn && !reduced ? `stroke-dashoffset 360ms ${EASE} 80ms` : 'none',
        }}
      />
    </svg>
  );
}

/** One page of results. Kept as its own piece so the page you leave can slide out while the next slides in. */
function Results({
  rows,
  run,
  reduced,
  listId,
  listLabel,
  optionId,
  active,
  setActive,
  choose,
  rowRefs,
  query = '',
  emptyGroup,
  close,
}: {
  rows: Row[];
  run: RunState | null;
  reduced: boolean;
  listId?: string;
  listLabel?: string;
  optionId?: (i: number) => string;
  active?: number;
  setActive?: (i: number) => void;
  choose?: (i: number) => void;
  rowRefs?: React.RefObject<(HTMLDivElement | null)[]>;
  query?: string;
  emptyGroup?: CommandPaletteProps['emptyGroup'];
  close?: () => void;
}) {
  // Consecutive rows of one group share a labelled group, so a screen reader hears the heading.
  const groups: { heading: string | null; rows: { row: Row; i: number }[] }[] = [];
  rows.forEach((row, i) => {
    const heading = row.item.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.rows.push({ row, i });
    else groups.push({ heading, rows: [{ row, i }] });
  });
  // A heading with nothing under it says so, once a query has found rows elsewhere.
  const emptyHeading =
    emptyGroup && query && rows.length > 0 && !groups.some((group) => group.heading === emptyGroup.heading)
      ? emptyGroup
      : null;
  return (
    <div id={listId} role={listId ? 'listbox' : undefined} aria-label={listId ? listLabel : undefined}>
      {groups.map((group, g) => {
        const aside = group.rows.find(({ row }) => row.item.groupAside)?.row.item.groupAside;
        return (
          <div key={g} role={group.heading ? 'group' : 'presentation'} aria-label={group.heading ?? undefined}>
            {group.heading && (
              <div className="flex items-baseline justify-between gap-sm px-sm pt-xs pb-2xs text-caption text-muted-foreground first:pt-2xs">
                <span aria-hidden="true">{group.heading}</span>
                {aside && (
                  <span className="flex items-baseline gap-3xs">
                    <span>{aside.text}</span>
                    {aside.link && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          tabIndex={-1}
                          // The field keeps focus, so the keys still work after a click that does not leave.
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => {
                            aside.link?.onSelect();
                            close?.();
                          }}
                          className={`cursor-pointer rounded-sm text-caption text-muted-foreground hover:text-foreground ${FOCUS}`}
                        >
                          {aside.link.label}
                        </button>
                      </>
                    )}
                  </span>
                )}
              </div>
            )}
            {group.rows.map(({ row, i }) => {
              const { item } = row;
              const running = run?.id === item.id;
              const state = running ? run.state : null;
              const isExit = Boolean(item.items || item.view);
              return (
                // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- A listbox option: the combobox input owns the keys and focus (aria-activedescendant). // guard-private: allow lint rule names, not a token
                <div
                  key={item.id}
                  ref={(el) => {
                    if (rowRefs) rowRefs.current[i] = el;
                  }}
                  id={optionId?.(i)}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <option> cannot hold an icon, a note and a status; the listbox is the combobox popup.
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={Boolean(run) || undefined}
                  onPointerMove={() => i !== active && setActive?.(i)}
                  onClick={() => choose?.(i)}
                  className="relative flex cursor-pointer items-center gap-sm rounded-md px-sm text-label text-foreground/80"
                  style={{ height: `${item.detail ? DETAIL_ROW : ROW}rem` }}
                >
                  {item.icon && (
                    <span
                      aria-hidden="true"
                      className="flex size-icon-sm shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-icon-sm"
                    >
                      {item.icon}
                    </span>
                  )}
                  {item.detail ? (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.label}</span>
                      <span className="truncate text-caption text-muted-foreground">{item.detail}</span>
                    </span>
                  ) : (
                    <span className="min-w-0 truncate">
                      <Marked text={item.label} marks={row.marks} />
                      {item.items && <span className="text-muted-foreground">…</span>}
                    </span>
                  )}
                  {item.note && (
                    <span className="min-w-0 truncate text-caption text-muted-foreground">{item.note}</span>
                  )}
                  {/* The right edge: where it lives or a chevron, which blurs into a spinner and then a check while it runs. */}
                  <span className="relative ml-auto flex h-icon shrink-0 items-center justify-end">
                    <span className="flex items-center gap-2xs" style={swap(!state, reduced)}>
                      {item.badges?.map((badge) => (
                        <Badge key={badge} outline size="sm" className="shrink-0">
                          {badge}
                        </Badge>
                      ))}
                      {item.items ? (
                        <CaretRightIcon aria-hidden="true" className="size-icon-sm text-muted-foreground" />
                      ) : (
                        item.meta && <span className="text-caption text-muted-foreground">{item.meta}</span>
                      )}
                      {isExit && !item.items && (
                        <CaretRightIcon aria-hidden="true" className="size-icon-sm text-muted-foreground" />
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 right-0 flex items-center"
                      style={swap(state === 'pending', reduced)}
                    >
                      <span
                        className={`size-icon-sm rounded-full border-2 border-border border-t-foreground/70 motion-reduce:animate-none ${state === 'pending' ? 'animate-spin' : ''}`}
                      />
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 right-0 flex items-center text-success"
                      style={swap(state === 'done', reduced)}
                    >
                      <Check drawn={state === 'done'} reduced={reduced} />
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
      {emptyHeading && (
        <div
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The same labelled group as the others, with no row in it: a fieldset would need a legend and a reset.
          role="group"
          aria-label={emptyHeading.heading}
          className="flex items-baseline justify-between gap-sm px-sm pt-xs pb-2xs text-caption text-muted-foreground"
        >
          <span aria-hidden="true">{emptyHeading.heading}</span>
          <span>{emptyHeading.text(query)}</span>
        </div>
      )}
    </div>
  );
}

/** Where the pill is, so the palette can grow out of it (and fold back into it). */
function pillBox(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Off screen, or hidden: open in place instead.
  if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height, radius: r.height / 2 };
}

export function CommandPalette({
  items,
  copy,
  emptyText,
  hotkey = 'k',
  onOpenChange,
  onQueryChange,
  emptyGroup,
  className = '',
  trigger = 'pill',
}: CommandPaletteProps) {
  const rail = trigger === 'rail';
  const reduced = useReducedMotion();
  const id = React.useId();
  const [phase, setPhase] = React.useState<Phase>('closed');
  const [query, setQuery] = React.useState('');
  const [stack, setStack] = React.useState<Page[]>([]);
  const [active, setActive] = React.useState(0);
  const [run, setRun] = React.useState<RunState | null>(null);
  const [failed, setFailed] = React.useState(false);
  // The pill's box the palette grows from, and the pixels in a rem, read when it opens.
  const [from, setFrom] = React.useState<Rect | null>(null);
  const [unit, setUnit] = React.useState(16);
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 });
  const [listHeight, setListHeight] = React.useState(0);
  const [highlight, setHighlight] = React.useState({ top: 0, ready: false });
  const [leaving, setLeaving] = React.useState<{ key: number; rows: Row[]; dir: number }[]>([]);
  const [enterDir, setEnterDir] = React.useState(0);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const paneRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const timer = React.useRef(0);
  const leaveKey = React.useRef(0);
  // Bumped whenever a session starts or ends, so an answer that arrives late is ignored.
  const session = React.useRef(0);

  const isOpen = phase === 'open';
  const mounted = phase !== 'closed';
  const page = stack[stack.length - 1];
  const view = page?.view;
  const pageItems = page ? page.items : items;
  const rows = React.useMemo(() => (pageItems ? rank(pageItems, query) : []), [pageItems, query]);
  // Hub: the caller learns every query (records are asked for from it); '' when the palette starts over.
  React.useEffect(() => onQueryChange?.(query), [onQueryChange, query]);
  // The active row, kept in range as the results change.
  const current = Math.min(active, Math.max(0, rows.length - 1));

  const freshStart = () => {
    session.current++;
    setQuery('');
    setStack([]);
    setActive(0);
    setRun(null);
    setFailed(false);
    setLeaving([]);
    setHighlight({ top: 0, ready: false });
  };

  const finishClose = () => {
    dialogRef.current?.close();
    // The dialog gives focus back to what opened it; if that is gone, the pill takes it.
    if (!document.activeElement || document.activeElement === document.body)
      triggerRef.current?.focus({ preventScroll: true });
  };

  const setOpen = React.useCallback(
    (next: boolean) => {
      window.clearTimeout(timer.current);
      if (next) {
        freshStart();
        setUnit(remPx());
        setViewport({ width: document.documentElement.clientWidth, height: window.innerHeight });
        setFrom(pillBox(triggerRef.current));
        setPhase(reduced ? 'open' : 'opening');
      } else {
        session.current++;
        setFrom(pillBox(triggerRef.current));
        if (reduced) {
          finishClose();
          setPhase('closed');
        } else setPhase('closing');
      }
      onOpenChange?.(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpenChange, reduced],
  );

  // A native modal dialog: top layer, inert page, and a Select inside it portals into it.
  React.useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (mounted && dialog && !dialog.open) {
      dialog.showModal();
      // Typing right after the hotkey must land in the field, even while the panel is still growing.
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [mounted]);

  // Folding back takes DURATION, however it was closed.
  React.useEffect(() => {
    if (phase !== 'closing') return;
    const done = window.setTimeout(() => {
      finishClose();
      setPhase('closed');
    }, DURATION);
    return () => window.clearTimeout(done);
  }, [phase]);

  // Paint at the pill's size first, then let it grow.
  React.useEffect(() => {
    if (phase !== 'opening') return;
    let inner = 0;
    const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setPhase('open'))));
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);

  // Hub: not while a page is open. Enter on an item before the grow ends opened its page, whose control took focus,
  // and this stole it back for the field (the hold confirmation then had no focus about half the time).
  React.useEffect(() => {
    if (isOpen && !view) inputRef.current?.focus({ preventScroll: true });
  }, [isOpen, view]);

  // Leaving a page unmounts the control that had focus; the field takes it in the same commit, so the next key still lands in the dialog.
  React.useLayoutEffect(() => {
    if (mounted && !view) inputRef.current?.focus({ preventScroll: true });
  }, [mounted, view]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  // The hotkey, from anywhere on the page.
  React.useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.key.toLowerCase() !== hotkey.toLowerCase() ||
        !(e.metaKey || e.ctrlKey) ||
        e.altKey ||
        e.shiftKey
      )
        return;
      e.preventDefault();
      setOpen(!(phase === 'open' || phase === 'opening'));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hotkey, phase, setOpen]);

  // The page behind stays where it is.
  React.useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const gap = window.innerWidth - html.clientWidth;
    const before = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    html.style.overflow = 'hidden';
    if (gap > 0) html.style.paddingRight = `${gap}px`;
    return () => {
      html.style.overflow = before.overflow;
      html.style.paddingRight = before.paddingRight;
    };
  }, [mounted]);

  // The list's height, so the panel can ease to fit the results.
  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setListHeight((h) => (h === el.offsetHeight ? h : el.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  // The highlight glides to the active row; the list scrolls only as far as it must.
  React.useLayoutEffect(() => {
    const row = rowRefs.current[current];
    const list = listRef.current;
    if (!row || !list) return;
    const top = row.offsetTop;
    setHighlight((h) => (h.top === top && h.ready ? h : { top, ready: h.ready || isOpen }));
    // Hub: while the panel still eases out of 0 (just opened), every row looks below the fold; scrolling then hid the
    // first heading for good (real data at 4K, step 64). The first row needs no scroll at all.
    if (current === 0 || list.clientHeight === 0) list.scrollTop = 0;
    else if (top < list.scrollTop) list.scrollTop = top - 4;
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + row.offsetHeight - list.clientHeight + 4;
  }, [current, rows, isOpen]);

  // A new page slides in from the side you went.
  React.useLayoutEffect(() => {
    if (!enterDir || reduced) return;
    paneRef.current?.animate(
      [
        { opacity: 0, filter: 'blur(4px)', transform: `translateX(${enterDir * 28}px)` },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ],
      { duration: 360, easing: EASE, delay: 40, fill: 'backwards' },
    );
  }, [stack.length, enterDir, reduced]);

  React.useEffect(() => {
    if (!leaving.length) return;
    const t = window.setTimeout(() => setLeaving([]), 260);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const go = (dir: 1 | -1, next: Page[]) => {
    if (!reduced) setLeaving((l) => [...l, { key: ++leaveKey.current, rows, dir }]);
    setEnterDir(dir);
    setStack(next);
    setQuery('');
    setActive(0);
    setHighlight((h) => ({ ...h, ready: false }));
  };

  const back = () => go(-1, stack.slice(0, -1));

  const choose = async (i: number) => {
    const row = rows[i];
    if (!row || run) return;
    const { item } = row;
    setActive(i);
    setFailed(false);
    if (item.items) return go(1, [...stack, { title: item.label.replace(/…$/, ''), items: item.items }]);
    if (item.view) return go(1, [...stack, { title: item.label, view: item.view }]);
    const mine = session.current;
    const result = item.onSelect?.();
    if (!(result instanceof Promise)) return setOpen(false);
    setRun({ id: item.id, state: 'pending' });
    try {
      await result;
      if (session.current !== mine) return;
      setRun({ id: item.id, state: 'done' });
      timer.current = window.setTimeout(() => setOpen(false), reduced ? 0 : 520);
    } catch {
      if (session.current !== mine) return;
      setRun(null);
      setFailed(true);
      rowRefs.current[i]?.animate(
        [
          { transform: 'none' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(-2px)' },
          { transform: 'none' },
        ],
        { duration: 380, easing: 'ease-out' },
      );
    }
  };

  const escape = () => {
    if (stack.length) back();
    else setOpen(false);
  };

  // Escape comes first, before a hold or a list inside a page can use it: back, then close.
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
    if (e.target instanceof Element && e.target.closest('[data-floating-layer]')) return;
    e.preventDefault();
    e.stopPropagation();
    escape();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (view) {
      if (e.key === 'Backspace' && e.target === inputRef.current) {
        e.preventDefault();
        back();
      }
      return;
    }
    const moves: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      Home: 0,
      End: rows.length - 1,
    };
    if (e.key in moves && rows.length) {
      if ((e.key === 'Home' || e.key === 'End') && query) return;
      e.preventDefault();
      setActive((moves[e.key] + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void choose(current);
    } else if (e.key === 'Backspace' && !query && stack.length) {
      e.preventDefault();
      back();
    } else if (e.key === 'Tab') {
      // Focus stays in the field; the list is reached with the arrows.
      e.preventDefault();
    }
  };

  // The palette hangs from where the pill is, centered on it, and falls back to the middle of the screen.
  const vw = viewport.width;
  const width = Math.min(WIDTH * unit, vw - 24);
  const hang = from && !rail;
  const centerX = hang ? from.left + from.width / 2 : vw / 2;
  const final: Rect | null = mounted
    ? {
        left: Math.min(Math.max(centerX - width / 2, 12), Math.max(12, vw - width - 12)),
        top: hang ? from.top - (HEADER * unit - from.height) / 2 : Math.max(48, Math.round(viewport.height * 0.16)),
        width,
        height: 0,
        radius: RADIUS * unit,
      }
    : null;
  const shape = isOpen || !from ? final : from;
  const listMax = rows.some(({ item }) => item.detail) ? LIST_MAX_RECORDS : LIST_MAX;
  const listVisible = Math.min(listHeight, listMax * unit);
  const panelHeight = (HEADER + FOOTER) * unit + (listVisible ? listVisible + LIST_PAD * unit : 0);
  const empty = !view && rows.length === 0;
  const listId = `${id}-list`;

  const panel =
    mounted && final && shape ? (
      <dialog
        ref={dialogRef}
        aria-label={copy.dialog}
        // Escape with nothing focused (a submitted form disables its field) reaches the dialog as a cancel, not as a key.
        onCancel={(e) => {
          e.preventDefault();
          escape();
        }}
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={onKeyDown}
        className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0 bg-transparent p-0 text-foreground backdrop:bg-transparent"
      >
        {/* A faint veil over the page; clicking it closes. */}
        <div
          aria-hidden="true"
          onPointerDown={() => setOpen(false)}
          className="absolute inset-0 bg-background/55"
          style={{ opacity: isOpen ? 1 : 0, transition: reduced ? 'none' : `opacity ${DURATION}ms ${EASE}` }}
        />
        <div
          className="absolute overflow-hidden bg-surface text-foreground"
          style={{
            left: shape.left,
            top: shape.top,
            width: shape.width,
            height: isOpen || !from ? panelHeight : from.height,
            borderRadius: shape.radius,
            boxShadow: 'inset 0 0 0 1px var(--border)',
            opacity: !from && !isOpen ? 0 : 1,
            transform: !from && !isOpen ? 'scale(0.97) translateY(-6px)' : 'none',
            transition: reduced
              ? 'none'
              : `left ${DURATION}ms ${EASE}, top ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}, border-radius ${DURATION}ms ${EASE}, opacity 240ms ${EASE}, transform ${DURATION}ms ${EASE}`,
          }}
        >
          {/* The pill's face, hotkey and all, fading as the panel grows out of it and back as it folds in. */}
          {from && (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-0 left-0 flex items-center text-label whitespace-nowrap text-muted-foreground ${rail ? 'justify-center' : 'gap-xs pr-xs pl-sm'}`}
              style={{
                width: rail ? from.width : undefined,
                height: from.height,
                opacity: isOpen ? 0 : 1,
                transition: reduced ? 'none' : isOpen ? 'opacity 120ms ease-out' : 'opacity 200ms ease-out 200ms',
              }}
            >
              {rail ? (
                <MagnifyingGlassIcon aria-hidden="true" className="size-icon-lg" />
              ) : (
                <PillFace label={copy.triggerLabel} />
              )}
            </span>
          )}

          <div
            className="absolute top-0 left-0 flex flex-col"
            style={{
              width: final.width,
              opacity: isOpen ? 1 : 0,
              transition: reduced ? 'none' : isOpen ? 'opacity 260ms ease-out 120ms' : 'opacity 100ms ease-out',
            }}
          >
            <div
              className="flex shrink-0 items-center gap-xs border-b border-border px-md"
              style={{ height: `${HEADER}rem` }}
            >
              <MagnifyingGlassIcon
                aria-hidden="true"
                data-icon="magnifying-glass"
                className="size-icon-sm shrink-0 text-muted-foreground"
              />
              {/* Where you are, as a chip that opens in when you go into a list or a page. */}
              <span
                className="grid shrink-0"
                style={{
                  gridTemplateColumns: page ? '1fr' : '0fr',
                  opacity: page ? 1 : 0,
                  transition: reduced ? 'none' : `grid-template-columns 360ms ${EASE}, opacity 240ms ${EASE}`,
                }}
              >
                <span className="min-w-0 overflow-hidden">
                  <span className="mr-3xs flex h-icon-lg items-center rounded-sm bg-muted px-xs text-caption whitespace-nowrap text-foreground">
                    <TextMorph>{page?.title ?? ''}</TextMorph>
                  </span>
                </span>
              </span>
              <input
                ref={inputRef}
                value={query}
                readOnly={Boolean(view)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                  setFailed(false);
                }}
                placeholder={view ? '' : page ? page.title : copy.search}
                aria-label={copy.search}
                role="combobox"
                aria-expanded="true"
                aria-controls={view ? undefined : listId}
                aria-activedescendant={!view && rows.length ? `${id}-opt-${current}` : undefined}
                aria-autocomplete="list"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
              />
              <Kbd>{copy.escape}</Kbd>
            </div>

            <div
              ref={listRef}
              className="relative [scrollbar-width:none] overflow-y-auto overscroll-contain px-2xs [&::-webkit-scrollbar]:hidden"
              style={{
                height: listVisible ? listVisible + LIST_PAD * unit : 0,
                transition: reduced || !isOpen ? 'none' : `height 300ms ${EASE}`,
              }}
            >
              <div ref={innerRef} className="relative py-2xs">
                {!empty && !view && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 rounded-md bg-muted"
                    style={{
                      top: 0,
                      height: `${rows[current]?.item.detail ? DETAIL_ROW : ROW}rem`,
                      transform: `translateY(${highlight.top}px)`,
                      transition: highlight.ready && !reduced ? `transform 200ms ${EASE}` : 'none',
                    }}
                  />
                )}
                {leaving.map((l) => (
                  <LeavingPane key={l.key} dir={l.dir}>
                    <Results rows={l.rows} run={null} reduced={reduced} />
                  </LeavingPane>
                ))}
                <div ref={paneRef} key={stack.length}>
                  {view ? (
                    <div className="p-sm">{view({ back })}</div>
                  ) : (
                    <Results
                      rows={rows}
                      run={run}
                      reduced={reduced}
                      listId={listId}
                      listLabel={copy.list}
                      optionId={(i) => `${id}-opt-${i}`}
                      active={current}
                      setActive={(i) => !run && setActive(i)}
                      choose={(i) => void choose(i)}
                      rowRefs={rowRefs}
                      query={query.trim()}
                      emptyGroup={page ? undefined : emptyGroup}
                      close={() => setOpen(false)}
                    />
                  )}
                </div>
                {empty && (
                  <output
                    className="flex items-center px-sm text-label text-muted-foreground"
                    style={{ height: `${ROW}rem` }}
                  >
                    <TextMorph>{emptyText(query.trim())}</TextMorph>
                  </output>
                )}
              </div>
            </div>

            <div
              className="flex shrink-0 items-center gap-md border-t border-border px-md text-caption text-muted-foreground"
              style={{ height: `${FOOTER}rem` }}
            >
              <p aria-live="polite" className="min-w-0 truncate">
                {run?.state === 'pending' ? copy.pending : failed ? copy.failed : ''}
              </p>
              <span className="ml-auto flex shrink-0 items-center gap-md">
                {!view && (
                  <>
                    <span className="flex items-center gap-xs">
                      <Kbd>↑</Kbd>
                      <Kbd>↓</Kbd>
                      {copy.move}
                    </span>
                    <span className="flex items-center gap-xs">
                      <Kbd>↵</Kbd>
                      {copy.open}
                    </span>
                  </>
                )}
                {stack.length > 0 && (
                  <span className="flex items-center gap-xs whitespace-nowrap">
                    <Kbd>{view ? copy.escape : '⌫'}</Kbd>
                    {copy.back}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </dialog>
    ) : null;

  return (
    <div className={`inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={copy.triggerName}
        onClick={() => setOpen(true)}
        className={`group inline-flex cursor-pointer items-center rounded-full ${rail ? 'bg-muted' : 'bg-surface'} text-label ${rail ? 'size-touch justify-center' : 'h-[2.25rem] gap-xs pr-xs pl-sm'} ${rail ? 'text-foreground' : 'text-muted-foreground'} shadow-[inset_0_0_0_1px_var(--border)] transition-[box-shadow,color] duration-300 hover:text-foreground hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_22%,transparent)] ${FOCUS}`}
        // When the palette folded back into the pill, it already looks exactly like it: take over without a fade.
        style={{ opacity: mounted ? 0 : 1, transition: mounted || reduced || from ? 'none' : 'opacity 160ms ease-out' }}
      >
        {rail ? (
          <MagnifyingGlassIcon aria-hidden="true" className="size-icon-lg" />
        ) : (
          <PillFace label={copy.triggerLabel} />
        )}
      </button>
      {panel}
    </div>
  );
}

/** The page you left: it slides out toward the side you came from, then removes itself. */
function LeavingPane({ dir, children }: { dir: number; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const animation = ref.current?.animate(
      [
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
        { opacity: 0, filter: 'blur(4px)', transform: `translateX(${-dir * 28}px)` },
      ],
      { duration: 240, easing: EASE, fill: 'forwards' },
    );
    return () => animation?.cancel();
  }, [dir]);
  return (
    <div ref={ref} inert aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2xs">
      {children}
    </div>
  );
}
