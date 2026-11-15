import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { localDay } from '../../lib/day.ts';
import type { CalendarItem } from '../../lib/module-ui.ts';
import { useNow } from '../../lib/use-now.ts';
import { m } from '../../paraglide/messages.js';
import { dayTitle, entriesByDay, monthDays, monthOf, monthTitle, shiftMonth, type DayEntry } from './days.ts';
import { EventDialog, type EventDraft } from './event-dialog.tsx';
import { useContributions } from './contributions.tsx';
import { useEventActions, useEvents } from './use-calendar.tsx';

const UNDO_MS = 8000;
const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
// Rows inside a cell, in rem: the day number line and one chip (caption line, 1px borders, `gap-3xs`). They set how many chips fit.
const NUMBER_ROW_REM = 1.125;
const CHIP_ROW_REM = 1.25;
const CELL_PAD_REM = 1;

const kindLabel = (entry: DayEntry) =>
  entry.label ??
  (entry.kind === 'work'
    ? m.calendar_kind_work()
    : entry.kind === 'note'
      ? m.calendar_kind_note()
      : m.calendar_kind_event());

const chipStyle: Record<CalendarItem['kind'], string> = {
  work: 'bg-accent text-background',
  event: 'border border-foreground/25 text-foreground',
  note: 'bg-foreground/15 italic text-foreground',
};

/** How many chips a cell of this height holds, so a busy day ends in "+N" instead of overflowing. */
function useChipCapacity() {
  const grid = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(2);
  useEffect(() => {
    const element = grid.current;
    if (!element) return undefined;
    function measure() {
      const cell = element?.firstElementChild;
      if (!(cell instanceof HTMLElement)) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const room = cell.clientHeight / rem - NUMBER_ROW_REM - CELL_PAD_REM;
      setCapacity(Math.max(1, Math.floor(room / CHIP_ROW_REM)));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { grid, capacity };
}

const roundButton =
  'flex size-touch cursor-pointer items-center justify-center rounded-full border border-border text-foreground hover:bg-muted';

/** Calendario: the month with every module's items on their day, and the chosen day beside it. */
export function CalendarPage() {
  const router = useRouter();
  const today = localDay(new Date(useNow('clock')));
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState<EventDraft>(null);
  const [removed, setRemoved] = useState<{ id: string; title: string } | null>(null);
  const actions = useEventActions();
  const days = monthDays(month);
  const range = { from: days[0] ?? today, to: days[41] ?? today };
  const events = useEvents(range).data ?? [];
  const { items, sources } = useContributions(range);
  const byDay = entriesByDay(events, items);
  const { grid, capacity } = useChipCapacity();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function select(day: string) {
    setSelected(day);
    // A grey day of the next or the last month moves the grid to it.
    if (monthOf(day) !== month) setMonth(monthOf(day));
  }
  function open(entry: DayEntry) {
    if (entry.own) setDraft({ event: entry.own });
    else if (entry.href) router.history.push(entry.href);
  }
  function showUndo(event: { id: string; title: string }) {
    clearTimeout(timer.current);
    setRemoved(event);
    timer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const chosen = byDay.get(selected) ?? [];
  return (
    <div className="flex min-h-0 flex-1 gap-lg">
      {sources}
      <section aria-label={monthTitle(month)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-sm">
        <div className="flex items-center gap-sm">
          <h2 className="text-title">{monthTitle(month)}</h2>
          <button
            type="button"
            aria-label={m.calendar_previous()}
            onClick={() => setMonth(shiftMonth(month, -1))}
            className={roundButton}
          >
            <CaretLeftIcon className="size-icon-sm" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={m.calendar_next()}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className={roundButton}
          >
            <CaretRightIcon className="size-icon-sm" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(monthOf(today));
              setSelected(today);
            }}
            className="min-h-touch cursor-pointer rounded-full border border-border px-md text-label hover:bg-muted"
          >
            {m.calendar_today()}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setDraft({ day: selected })}
            className="min-h-touch cursor-pointer rounded-full bg-foreground px-lg text-label font-medium text-background"
          >
            {m.calendar_new()}
          </button>
        </div>
        <div aria-hidden className="grid grid-cols-7 px-xs text-caption text-muted-foreground">
          {WEEKDAYS.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <section
          ref={grid}
          aria-label={m.calendar_grid()}
          className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-2xs"
        >
          {days.map((day) => {
            const entries = byDay.get(day) ?? [];
            const inMonth = monthOf(day) === month;
            const shown = entries.length > capacity ? capacity - 1 : capacity;
            const hidden = entries.length - shown;
            return (
              <div
                key={day}
                data-day={day}
                className={`relative flex min-h-0 min-w-0 flex-col gap-3xs overflow-hidden rounded-md p-xs ${day === selected ? 'bg-foreground/15 outline outline-foreground/40' : 'bg-muted'}`}
              >
                <button
                  type="button"
                  aria-label={dayTitle(day)}
                  aria-pressed={day === selected}
                  onClick={() => select(day)}
                  className="absolute inset-0 cursor-pointer rounded-md"
                />
                <span
                  className={`pointer-events-none relative self-start text-caption tabular-nums ${day === today ? 'rounded-full bg-foreground px-xs font-semibold text-background' : inMonth ? '' : 'text-muted-foreground/50'}`}
                >
                  {Number(day.slice(8))}
                </span>
                {inMonth &&
                  entries.slice(0, shown).map((entry) => {
                    const text = `${entry.time ? `${entry.time} ` : ''}${entry.title}`;
                    const style = `relative block max-w-full truncate rounded-sm px-xs text-caption ${chipStyle[entry.kind]}`;
                    return entry.own || entry.href ? (
                      <button
                        key={entry.id}
                        type="button"
                        aria-label={entry.own ? m.calendar_edit({ title: entry.title }) : undefined}
                        onClick={() => open(entry)}
                        className={`${style} cursor-pointer text-left`}
                      >
                        {text}
                      </button>
                    ) : (
                      <span key={entry.id} className={`${style} pointer-events-none`}>
                        {text}
                      </span>
                    );
                  })}
                {inMonth && hidden > 0 && (
                  <span
                    aria-label={m.calendar_more_named({ count: hidden, day: dayTitle(day) })}
                    className="pointer-events-none relative text-caption text-muted-foreground"
                  >
                    {m.calendar_more({ count: hidden })}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      </section>
      <aside
        aria-label={dayTitle(selected)}
        className="flex min-h-0 w-day-panel shrink-0 flex-col gap-sm rounded-lg bg-muted p-md"
      >
        <h3 className="text-title">{dayTitle(selected)}</h3>
        <ul className="flex min-h-0 flex-col gap-xs overflow-y-auto">
          {chosen.map((entry) => {
            const lines = (
              <>
                <span className="text-caption text-muted-foreground">
                  {entry.time ? `${entry.time} · ` : ''}
                  {kindLabel(entry)}
                </span>
                <span className="text-body">{entry.title}</span>
                {entry.origin && <span className="text-caption text-muted-foreground">{entry.origin}</span>}
              </>
            );
            const card = 'flex w-full flex-col gap-3xs rounded-md bg-foreground/10 px-md py-sm text-left';
            return (
              <li key={entry.id}>
                {entry.own || entry.href ? (
                  <button type="button" onClick={() => open(entry)} className={`${card} cursor-pointer`}>
                    {lines}
                  </button>
                ) : (
                  <div className={card}>{lines}</div>
                )}
              </li>
            );
          })}
        </ul>
        {chosen.length === 0 && <p className="text-label text-muted-foreground">{m.calendar_empty()}</p>}
        <div className="flex-1" />
        <p className="text-caption text-muted-foreground">{m.calendar_note()}</p>
      </aside>
      <EventDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={select}
        onRemoved={(event) => showUndo({ id: event.id, title: event.title })}
      />
      {removed && (
        <output className="fixed bottom-xl left-1/2 z-50 flex h-touch -translate-x-1/2 items-center gap-md rounded-full border border-border bg-surface-raised pr-xs pl-lg text-label">
          {m.calendar_removed()}
          <button
            type="button"
            aria-label={m.calendar_undo_named({ title: removed.title })}
            className="min-h-xl cursor-pointer rounded-full bg-foreground px-md text-caption font-medium text-background"
            onClick={() => {
              void actions.restore.mutateAsync({ id: removed.id });
              clearTimeout(timer.current);
              setRemoved(null);
            }}
          >
            {m.calendar_undo()}
          </button>
        </output>
      )}
    </div>
  );
}
