import type { TodayDay, TodayLine } from '../../lib/module-ui.ts';
import { useNow } from '../../lib/use-now.ts';
import { addDays, localDay } from '../../lib/day.ts';
import { m } from '../../paraglide/messages.js';
import { useEvents } from './use-calendar.tsx';

/** Oggi's lines: one per own event of the day ("16:30 Dentista"); tomorrow without one says so. Shifts stay out (plan 55, decision 2). */
export function useCalendarTodayLines(day: TodayDay): TodayLine[] | null {
  const today = localDay(new Date(useNow('clock')));
  const target = day === 'today' ? today : addDays(today, 1);
  const events = useEvents({ from: target, to: target }).data?.filter((event) => event.kind !== 'shift');
  if (!events) return null;
  if (!events.length) return day === 'tomorrow' ? [{ id: 'calendar-none', text: m.calendar_tomorrow_none() }] : null;
  return events.map((event) => ({
    id: `calendar-${event.id}`,
    chip: m.calendar_chip(),
    text: event.start ? `${event.start} ${event.title}` : event.title,
    href: '/desk/calendar',
  }));
}
