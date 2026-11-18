import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { localDay } from '../../lib/day.ts';
import { useNow } from '../../lib/use-now.ts';
import { m } from '../../paraglide/messages.js';
import { AgendaView } from './agenda.tsx';
import { monthOf, type DayEntry } from './days.ts';
import { EventDialog, type EventDraft, type RemovedEvent } from './event-dialog.tsx';
import { MonthView } from './month.tsx';
import { useEventActions } from './use-calendar.tsx';
import { useViewState } from './view-state.ts';
import { WeekView } from './week.tsx';

const UNDO_MS = 8000;

/** Calendario: Mese, Settimana or Agenda (the choice is remembered), the event card and the Annulla toast. */
export function CalendarPage() {
  const router = useRouter();
  const today = localDay(new Date(useNow('clock')));
  const { view, setView, show, setShow } = useViewState();
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [anchor, setAnchor] = useState(today);
  const [draft, setDraft] = useState<EventDraft>(null);
  const [removed, setRemoved] = useState<RemovedEvent | null>(null);
  const actions = useEventActions();
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
  function showUndo(event: RemovedEvent) {
    clearTimeout(timer.current);
    setRemoved(event);
    timer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const controls = {
    view,
    onView: setView,
    onNew: () => setDraft({ day: view === 'month' ? selected : view === 'week' ? anchor : today }),
  };
  return (
    <div className="flex min-h-0 flex-1 gap-lg">
      {view === 'month' && (
        <MonthView
          today={today}
          month={month}
          setMonth={setMonth}
          selected={selected}
          setSelected={setSelected}
          select={select}
          open={open}
          controls={controls}
        />
      )}
      {view === 'week' && (
        <WeekView today={today} anchor={anchor} setAnchor={setAnchor} show={show} open={open} controls={controls} />
      )}
      {view === 'agenda' && <AgendaView today={today} show={show} setShow={setShow} open={open} controls={controls} />}
      <EventDialog draft={draft} onClose={() => setDraft(null)} onSaved={select} onRemoved={showUndo} />
      {removed && (
        <output className="fixed bottom-xl left-1/2 z-50 flex h-touch -translate-x-1/2 items-center gap-md rounded-full border border-border bg-surface-raised pr-xs pl-lg text-label">
          {m.calendar_removed()}
          <button
            type="button"
            aria-label={m.calendar_undo_named({ title: removed.title })}
            className="min-h-xl cursor-pointer rounded-full bg-foreground px-md text-caption font-medium text-background"
            onClick={() => {
              if (removed.kind === 'series') void actions.restoreSeries.mutateAsync({ id: removed.id });
              else if (removed.kind === 'occurrence')
                void actions.restoreOccurrence.mutateAsync({ seriesId: removed.id, day: removed.day });
              else void actions.restore.mutateAsync({ id: removed.id });
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
