// Hairline UI · date-picker (calendar part) · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

import * as React from 'react';
import { TextMorph } from './text-morph.tsx';
import { EASE_OUT, EASE_THROW, INTERACTION_FOCUS, useInteractionReducedMotion } from './ui-interaction-motion.ts';

/* ─────────────────────────────────────────────────────────
 * CALENDAR: one month, one chosen day
 *
 *   pick     the chosen day's mark glides from day to day
 *   months   slide in from the side you moved toward while the
 *            month name morphs
 *   keys     arrows move a day or a week, Page Up/Down a month,
 *            Home/End the week's ends, Enter picks
 *
 * The month grid of Hairline's date picker without its typed field: the
 * caller decides where it sits. Values are plain "YYYY-MM-DD".
 * ───────────────────────────────────────────────────────── */

export interface CalendarProps {
  value: string | null;
  onValueChange: (value: string) => void;
  /** Earliest allowed day, "YYYY-MM-DD": also the month shown when nothing is chosen. */
  min: string;
  /** Latest allowed day. */
  max?: string;
  locale?: string;
  /** Names of the month buttons, in the page's language. */
  previousLabel: string;
  nextLabel: string;
  /** Moves focus to the chosen day when it mounts. */
  autoFocus?: boolean;
}

// Plain dates, UTC under the hood so no time zone shifts a day.
const toISO = (date: Date) => date.toISOString().slice(0, 10);
const fromISO = (day: string) => new Date(`${day}T00:00:00Z`);
const addDays = (day: string, count: number) => {
  const date = fromISO(day);
  date.setUTCDate(date.getUTCDate() + count);
  return toISO(date);
};
const addMonths = (day: string, count: number) => {
  const date = fromISO(day);
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, last));
  return toISO(date);
};
const monthOf = (day: string) => day.slice(0, 7);
const WEEK_STARTS_ON = 1;
const weekIndex = (day: string) => (fromISO(day).getUTCDay() - WEEK_STARTS_ON + 7) % 7;

function Arrow({ back }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-icon-sm">
      <path
        d={back ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Calendar({
  value,
  onValueChange,
  min,
  max,
  locale = 'it-IT',
  previousLabel,
  nextLabel,
  autoFocus,
}: CalendarProps) {
  const reduced = useInteractionReducedMotion();
  const start = value ?? min;
  const [view, setView] = React.useState(() => monthOf(start));
  const [focusDay, setFocusDay] = React.useState(start);
  const [dir, setDir] = React.useState(0);
  const [focusing, setFocusing] = React.useState(autoFocus ?? false);
  const grid = React.useRef<HTMLFieldSetElement>(null);
  const [mark, setMark] = React.useState<{ x: number; y: number } | null>(null);
  const [markReady, setMarkReady] = React.useState(false);

  const monthFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [locale],
  );
  const dayFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    [locale],
  );
  const headFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }),
    [locale],
  );
  const allowed = (day: string) => day >= min && (!max || day <= max);

  // Days of the shown month, padded to whole weeks.
  const days = React.useMemo(() => {
    const first = `${view}-01`;
    const lead = weekIndex(first);
    const firstDate = fromISO(first);
    const length = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 0)).getUTCDate();
    const count = Math.ceil((lead + length) / 7) * 7;
    return Array.from({ length: count }, (_, index) => addDays(first, index - lead));
  }, [view]);

  const goMonth = (count: number) => {
    setDir(count);
    setView((current) => monthOf(addMonths(`${current}-01`, count)));
    setFocusDay((current) => addMonths(current, count));
  };

  // The chosen day's mark glides within a month; a new month slides in from its side.
  React.useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () => {
      const cell = value ? element.querySelector<HTMLElement>(`[data-day="${value}"]`) : null;
      setMark((previous) =>
        cell
          ? previous && previous.x === cell.offsetLeft && previous.y === cell.offsetTop
            ? previous
            : { x: cell.offsetLeft, y: cell.offsetTop }
          : null,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, view]);
  React.useEffect(() => {
    if (!mark || markReady) return;
    const frame = requestAnimationFrame(() => setMarkReady(true));
    return () => cancelAnimationFrame(frame);
  }, [mark, markReady]);
  React.useLayoutEffect(() => {
    if (!dir || reduced) return;
    grid.current?.animate(
      [
        { opacity: 0, transform: `translateX(${dir * 24}px)`, filter: 'blur(4px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 360, easing: EASE_OUT },
    );
  }, [view, dir, reduced]);

  // Keyboard focus follows the focused day once the grid has it.
  React.useEffect(() => {
    if (!focusing) return;
    grid.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true });
  }, [focusing, focusDay, view]);

  const onGridKey = (event: React.KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focusDay, -1),
      ArrowRight: () => addDays(focusDay, 1),
      ArrowUp: () => addDays(focusDay, -7),
      ArrowDown: () => addDays(focusDay, 7),
      PageUp: () => addMonths(focusDay, -1),
      PageDown: () => addMonths(focusDay, 1),
      Home: () => addDays(focusDay, -weekIndex(focusDay)),
      End: () => addDays(focusDay, 6 - weekIndex(focusDay)),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const next = move();
      if (monthOf(next) !== view) {
        setDir(next > focusDay ? 1 : -1);
        setView(monthOf(next));
      }
      setFocusing(true);
      setFocusDay(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (allowed(focusDay)) onValueChange(focusDay);
    }
  };

  const monthName = monthFormat.format(fromISO(`${view}-01`));
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between pl-xs">
        <span className="text-label" aria-live="polite">
          <TextMorph>{monthName}</TextMorph>
        </span>
        <div className="flex">
          {[-1, 1].map((count) => (
            <button
              key={count}
              type="button"
              aria-label={count < 0 ? previousLabel : nextLabel}
              onClick={() => goMonth(count)}
              className={`flex size-touch cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${INTERACTION_FOCUS}`}
            >
              <Arrow back={count < 0} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-caption text-muted-foreground" aria-hidden="true">
        {days.slice(0, 7).map((day) => (
          <span key={day}>{headFormat.format(fromISO(day))}</span>
        ))}
      </div>
      <fieldset
        ref={grid}
        aria-label={monthName}
        className="relative m-0 grid min-w-0 grid-cols-7 gap-y-3xs border-0 p-0"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 size-touch rounded-full bg-foreground"
          style={{
            transform: `translate3d(${mark?.x ?? 0}px, ${mark?.y ?? 0}px, 0)`,
            opacity: mark ? 1 : 0,
            transition: reduced || !markReady ? 'none' : `transform 420ms ${EASE_THROW}, opacity 200ms ${EASE_OUT}`,
          }}
        />
        {days.map((day) => {
          const inMonth = monthOf(day) === view;
          const chosen = day === value;
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              aria-pressed={chosen}
              aria-label={dayFormat.format(fromISO(day))}
              tabIndex={day === focusDay ? 0 : -1}
              onKeyDown={onGridKey}
              onFocus={() => setFocusing(true)}
              disabled={!allowed(day)}
              onClick={() => {
                setFocusDay(day);
                onValueChange(day);
              }}
              className={`relative z-10 mx-auto flex size-touch cursor-pointer items-center justify-center rounded-full text-label font-normal tabular-nums transition-colors duration-200 disabled:cursor-default disabled:opacity-30 ${INTERACTION_FOCUS} ${
                chosen
                  ? 'text-background'
                  : inMonth
                    ? 'text-foreground hover:bg-muted'
                    : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
