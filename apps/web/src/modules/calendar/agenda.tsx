import { EmptyState } from '../../components/ui/empty-state.tsx';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Switch } from '../../components/ui/switch.tsx';
import { addDays } from '../../lib/day.ts';
import { m } from '../../paraglide/messages.js';
import { useContributions } from './contributions.tsx';
import {
  agendaDateText,
  agendaDays,
  agendaName,
  dayTitle,
  entriesByDay,
  filterEntries,
  monthDays,
  monthOf,
  monthTitle,
  shiftMonth,
  type DayEntry,
  type Show,
} from './days.ts';
import { NewEventButton, ViewSwitch, type Controls } from './header.tsx';
import { kindName, whenText } from './kinds.ts';
import { useEvents } from './use-calendar.tsx';

/** How far the list reads from its first day: a month of days, so Studio's sliding days do not fill it endlessly. */
export const AGENDA_DAYS = 30;
const WEEKDAY_LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

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
  const range = {
    from: [start, miniDays[0] ?? start].sort()[0] ?? start,
    to: [addDays(start, AGENDA_DAYS), miniDays[miniDays.length - 1] ?? start].sort().reverse()[0] ?? start,
  };
  const events = useEvents(range).data ?? [];
  const { items, sources } = useContributions(range);
  const shown = new Map(
    [...entriesByDay(events, items)].map(([day, entries]) => [day, filterEntries(entries, show)] as const),
  );
  const list = agendaDays(shown, start, AGENDA_DAYS);
  const words = { today: m.calendar_today(), tomorrow: m.calendar_tomorrow() };
  const toggles: Array<[keyof Show, string]> = [
    ['work', m.calendar_kind_work()],
    ['study', m.calendar_kind_study()],
    ['shift', m.calendar_shifts()],
    ['note', m.calendar_kind_note()],
  ];
  const card = 'flex flex-col gap-sm rounded-lg bg-muted p-md';
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
        {list.length === 0 && <EmptyState scene="calendar" title={m.calendar_empty()} />}
      </section>
      <aside className="flex min-h-0 w-day-panel shrink-0 flex-col gap-md">
        <section aria-label={m.calendar_pick_month()} className={card}>
          <div className="flex items-center justify-between">
            <span className="text-label">{monthTitle(mini)}</span>
            <span className="flex gap-xs">
              <button
                type="button"
                aria-label={m.calendar_month_previous()}
                onClick={() => setMini(shiftMonth(mini, -1))}
                className="cursor-pointer text-muted-foreground"
              >
                <CaretLeftIcon className="size-icon-sm" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={m.calendar_month_next()}
                onClick={() => setMini(shiftMonth(mini, 1))}
                className="cursor-pointer text-muted-foreground"
              >
                <CaretRightIcon className="size-icon-sm" aria-hidden />
              </button>
            </span>
          </div>
          <div aria-hidden className="grid grid-cols-7 text-center text-caption text-muted-foreground">
            {WEEKDAY_LETTERS.map((letter, index) => (
              <span key={index}>{letter}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-3xs text-center text-label font-normal">
            {miniDays.map((day) => {
              const busy = (shown.get(day) ?? []).length > 0;
              const inMonth = monthOf(day) === mini;
              const style =
                day === today
                  ? 'rounded-full bg-foreground font-semibold text-background'
                  : day === start
                    ? 'rounded-full outline outline-foreground/40'
                    : inMonth
                      ? ''
                      : 'text-muted-foreground/50';
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={dayTitle(day)}
                  aria-pressed={day === start}
                  onClick={() => {
                    setStart(day);
                    setMini(monthOf(day));
                  }}
                  className={`relative cursor-pointer pt-2xs pb-xs tabular-nums ${style}`}
                >
                  {Number(day.slice(8))}
                  {busy && day !== today && (
                    <span
                      aria-hidden
                      className="absolute bottom-3xs left-1/2 size-2xs -translate-x-1/2 rounded-full bg-accent"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <section aria-label={m.calendar_show()} className={card}>
          <h3 className="text-label">{m.calendar_show()}</h3>
          {toggles.map(([kind, label]) => (
            <Switch
              key={kind}
              label={label}
              labelPosition="start"
              className="w-full"
              checked={show[kind]}
              onCheckedChange={(on) => setShow({ ...show, [kind]: on })}
            />
          ))}
        </section>
      </aside>
    </>
  );
}
