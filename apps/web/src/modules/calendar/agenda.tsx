import { CalendarAside } from './calendar-aside.tsx';
import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { EmptyState } from '../../components/ui/empty-state.tsx';
import { useState } from 'react';
import { addDays } from '../../lib/day.ts';
import { m } from '../../paraglide/messages.js';
import { useContributions } from './contributions.tsx';
import {
  agendaDateText,
  agendaDays,
  agendaName,
  entriesByDay,
  filterEntries,
  monthDays,
  monthOf,
  type DayEntry,
  type Show,
} from './days.ts';
import { NewEventButton, ViewSwitch, type Controls } from './header.tsx';
import { kindName, whenText } from './kinds.ts';
import { useEvents } from './use-calendar.tsx';

/** How far the list reads from its first day: a month of days, so Studio's sliding days do not fill it endlessly. */
export const AGENDA_DAYS = 30;

const tagStyle: Record<DayEntry['kind'], string> = {
  work: 'bg-accent text-background',
  event: 'bg-foreground/10',
  shift: 'border border-foreground/25',
  note: 'bg-foreground/15',
  study: 'bg-foreground/10',
};

function AgendaRow({ entry, onOpen }: { entry: DayEntry; onOpen: (entry: DayEntry) => void }) {
  const row = 'flex w-full items-baseline gap-sm text-left';
  const cells = (
    <>
      <span className="w-label-col shrink-0 text-label font-normal text-muted-foreground tabular-nums">
        {whenText(entry)}
      </span>
      <span
        className={`w-agenda-tag shrink-0 truncate rounded-full px-xs py-3xs text-center text-caption ${tagStyle[entry.kind]}`}
      >
        {kindName(entry.kind)}
      </span>
      <span className="min-w-0 flex-1 text-body">{entry.title}</span>
    </>
  );
  return entry.own || entry.href ? (
    <button type="button" onClick={() => onOpen(entry)} className={`${row} cursor-pointer`}>
      {cells}
    </button>
  ) : (
    <div className={row}>{cells}</div>
  );
}

/** Calendario, Agenda: the days from a day on that have items, a small month to jump with, and the Mostra switches. */
export function AgendaView({
  today,
  show,
  setShow,
  open,
  controls,
}: {
  today: string;
  show: Show;
  setShow: (show: Show) => void;
  open: (entry: DayEntry) => void;
  controls: Controls;
}) {
  const [start, setStart] = useState(today);
  const [mini, setMini] = useState(() => monthOf(today));
  const cells = monthDays(mini);
  // Six rows only when the month needs them.
  const miniDays = monthOf(cells[35] ?? mini) === mini ? cells : cells.slice(0, 35);
  const miniStart = miniDays[0] ?? start;
  const miniEnd = miniDays[miniDays.length - 1] ?? start;
  const agendaEnd = addDays(start, AGENDA_DAYS);
  const range = {
    from: start <= miniStart ? start : miniStart,
    to: agendaEnd >= miniEnd ? agendaEnd : miniEnd,
  };
  const events = useEvents(range);
  const { items, sources } = useContributions(range);
  const shown = new Map(
    [...entriesByDay(events.data ?? [], items)].map(([day, entries]) => [day, filterEntries(entries, show)] as const),
  );
  const list = agendaDays(shown, start, AGENDA_DAYS);
  const words = { today: m.calendar_today(), tomorrow: m.calendar_tomorrow() };
  return (
    <>
      {sources}
      <section aria-label={m.calendar_upcoming()} className="flex min-h-0 min-w-0 flex-1 flex-col gap-xs">
        <div className="flex items-center gap-sm pb-xs">
          <h2 className="text-title">{m.calendar_upcoming()}</h2>
          <div className="flex-1" />
          <ViewSwitch view={controls.view} onView={controls.onView} />
          <NewEventButton onNew={controls.onNew} />
        </div>
        <ol className={`flex min-h-0 flex-col overflow-y-auto overscroll-contain ${list.length ? 'flex-1' : ''}`}>
          {list.map(({ day, entries }) => (
            <li key={day} className="flex gap-md border-t border-dashed border-border py-sm">
              <div className="flex w-agenda-day shrink-0 flex-col">
                <span className={`text-body ${day === today ? 'font-semibold' : 'font-medium'}`}>
                  {agendaName(day, today, words)}
                </span>
                <span className="text-caption text-muted-foreground">{agendaDateText(day, today)}</span>
              </div>
              <ul className="flex min-w-0 flex-1 flex-col gap-xs">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <AgendaRow entry={entry} onOpen={open} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {events.isPending ? (
          <LoadingSkeleton label={m.tile_loading()} />
        ) : list.length === 0 ? (
          <EmptyState scene="calendar" title={m.calendar_empty()} />
        ) : null}
      </section>
      <CalendarAside
        today={today}
        selected={start}
        mini={mini}
        setMini={setMini}
        miniDays={miniDays}
        shown={shown}
        show={show}
        setShow={setShow}
        onSelect={setStart}
      />
    </>
  );
}
