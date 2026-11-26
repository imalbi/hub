import { useState } from 'react';
import { CalendarAside } from './calendar-aside.tsx';
import { addDays } from '../../lib/day.ts';
import { m } from '../../paraglide/messages.js';
import { useContributions } from './contributions.tsx';
import {
  monthOf,
  monthDays,
  dayTitle,
  entriesByDay,
  filterEntries,
  shortDay,
  weekdayName,
  weekDays,
  weekTitle,
  type DayEntry,
  type Show,
} from './days.ts';
import { EntryCard } from './entry-card.tsx';
import { NavHeader, type Controls } from './header.tsx';
import { useEvents } from './use-calendar.tsx';

// How far past the week "Poi:" looks, and how many items it names.
const THEN_DAYS = 30;
const THEN_ITEMS = 3;

/** Calendario, Settimana: seven day columns with their items as cards, and the next few items after the week. */
export function WeekView({
  today,
  anchor,
  setAnchor,
  show,
  setShow,
  open,
  controls,
}: {
  today: string;
  anchor: string;
  setAnchor: (day: string) => void;
  show: Show;
  setShow: (show: Show) => void;
  open: (entry: DayEntry) => void;
  controls: Controls;
}) {
  const [mini, setMini] = useState(() => monthOf(anchor));
  const cells = monthDays(mini);
  const miniDays = monthOf(cells[35] ?? mini) === mini ? cells : cells.slice(0, 35);
  const days = weekDays(anchor);
  const last = days[6] ?? anchor;
  const first = days[0] ?? anchor;
  const miniStart = miniDays[0] ?? anchor;
  const miniEnd = miniDays.at(-1) ?? anchor;
  const thenEnd = addDays(last, THEN_DAYS);
  const range = {
    from: first < miniStart ? first : miniStart,
    to: thenEnd > miniEnd ? thenEnd : miniEnd,
  };
  const events = useEvents(range).data ?? [];
  const { items, sources } = useContributions(range);
  const byDay = entriesByDay(events, items);
  // A study day slides along the plan every day, so it is not "next" in the sense of a date to look forward to.
  const then = [...byDay]
    .filter(([day]) => day > last && day <= thenEnd)
    .flatMap(([day, entries]) =>
      filterEntries(entries, show)
        .filter((entry) => entry.kind !== 'study')
        .map((entry) => ({ day, entry })),
    )
    .slice(0, THEN_ITEMS);
  return (
    <>
      <section aria-label={weekTitle(days)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-sm">
        {sources}
        <NavHeader
          title={weekTitle(days)}
          previousLabel={m.calendar_week_previous()}
          nextLabel={m.calendar_week_next()}
          onPrevious={() => setAnchor(addDays(anchor, -7))}
          onNext={() => setAnchor(addDays(anchor, 7))}
          onToday={() => setAnchor(today)}
          controls={controls}
        />
        <div className="grid min-h-0 flex-1 grid-cols-7 gap-xs">
          {days.map((day) => (
            <section
              key={day}
              aria-label={dayTitle(day)}
              data-day={day}
              className={`flex min-h-0 min-w-0 flex-col gap-xs overflow-y-auto rounded-lg p-sm ${day === today ? 'bg-foreground/15' : 'bg-muted'}`}
            >
              <div className="flex items-baseline gap-xs border-b border-dashed border-border pb-xs">
                <span className="text-caption text-muted-foreground">{weekdayName(day)}</span>
                <span className="text-body font-medium tabular-nums">{Number(day.slice(8))}</span>
              </div>
              {filterEntries(byDay.get(day) ?? [], show).map((entry) => (
                <EntryCard key={entry.id} entry={entry} onOpen={open} />
              ))}
            </section>
          ))}
        </div>
        {then.length > 0 && (
          <p className="flex items-center gap-md text-caption text-muted-foreground">
            <span>{m.calendar_then()}</span>
            {then.map(({ day, entry }) => (
              <span key={entry.id}>{`${shortDay(day)}, ${entry.title}`}</span>
            ))}
          </p>
        )}
      </section>
      <CalendarAside
        today={today}
        selected={anchor}
        mini={mini}
        setMini={setMini}
        miniDays={miniDays}
        shown={new Map([...byDay].map(([day, entries]) => [day, filterEntries(entries, show)]))}
        show={show}
        setShow={setShow}
        onSelect={setAnchor}
        week
      />
    </>
  );
}
