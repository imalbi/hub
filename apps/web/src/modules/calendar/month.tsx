import { EmptyState } from '../../components/ui/empty-state.tsx';
import { useEffect, useRef, useState } from 'react';
import { m } from '../../paraglide/messages.js';
import { dayTitle, entriesByDay, monthDays, monthOf, monthTitle, shiftMonth, type DayEntry } from './days.ts';
import { NavHeader, type Controls } from './header.tsx';
import { useContributions } from './contributions.tsx';
import { metaLine } from './kinds.ts';
import { useEvents } from './use-calendar.tsx';

const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
// Rows inside a cell, in rem: the day number line and one chip (caption line, 1px borders, `gap-3xs`). They set how many chips fit.
const NUMBER_ROW_REM = 1.125;
const CHIP_ROW_REM = 1.25;
const CELL_PAD_REM = 1;

const chipStyle: Record<DayEntry['kind'], string> = {
  work: 'bg-accent text-background',
  event: 'border border-foreground/25 text-foreground',
  note: 'bg-foreground/15 italic text-foreground',
  study: 'bg-foreground/10 text-foreground',
  // Never drawn in the grid (a shift is too long for a chip); the key keeps the record complete.
  shift: 'border border-foreground/25 text-foreground',
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

/** Calendario, Mese: the month with every module's items on their day, and the chosen day beside it. */
export function MonthView({
  today,
  month,
  setMonth,
  selected,
  setSelected,
  select,
  open,
  controls,
}: {
  today: string;
  month: string;
  setMonth: (month: string) => void;
  selected: string;
  setSelected: (day: string) => void;
  select: (day: string) => void;
  open: (entry: DayEntry) => void;
  controls: Controls;
}) {
  const days = monthDays(month);
  const range = { from: days[0] ?? today, to: days[41] ?? today };
  const events = useEvents(range).data ?? [];
  const { items, sources } = useContributions(range);
  const byDay = entriesByDay(events, items);
  const { grid, capacity } = useChipCapacity();

  const chosen = byDay.get(selected) ?? [];
  return (
    <div className="flex min-h-0 flex-1 gap-lg">
      {sources}
      <section aria-label={monthTitle(month)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-sm">
        <NavHeader
          title={monthTitle(month)}
          previousLabel={m.calendar_previous()}
          nextLabel={m.calendar_next()}
          onPrevious={() => setMonth(shiftMonth(month, -1))}
          onNext={() => setMonth(shiftMonth(month, 1))}
          onToday={() => {
            setMonth(monthOf(today));
            setSelected(today);
          }}
          controls={controls}
        />
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
            const entries = (byDay.get(day) ?? []).filter((entry) => entry.kind !== 'shift');
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
                <span className="text-caption text-muted-foreground">{metaLine(entry)}</span>
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
        {chosen.length === 0 && <EmptyState title={m.calendar_empty()} />}
        <div className="flex-1" />
        <p className="text-caption text-muted-foreground">{m.calendar_note()}</p>
      </aside>
    </div>
  );
}
