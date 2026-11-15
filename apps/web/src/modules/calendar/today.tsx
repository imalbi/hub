import { useNow } from '../../lib/use-now.ts';
import { localDay } from '../../lib/day.ts';
import { m } from '../../paraglide/messages.js';
import { useEvents } from './use-calendar.tsx';

/** Oggi: one line per event of today ("16:30 Dentista"). Contributed items already show through their own modules. */
export function CalendarToday() {
  const today = localDay(new Date(useNow('clock')));
  // Shifts are other people's days (decision 2): they stay off Oggi.
  const events = useEvents({ from: today, to: today }).data?.filter((event) => event.kind !== 'shift');
  if (!events?.length) return null;
  return (
    <ul aria-label={m.calendar_today_region()} className="flex flex-col">
      {events.map((event) => (
        <li key={event.id}>
          {event.start && <span className="text-muted-foreground tabular-nums">{event.start} </span>}
          {event.title}
        </li>
      ))}
    </ul>
  );
}
