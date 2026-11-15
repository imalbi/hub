import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import type { CalendarItem } from '../../lib/module-ui.ts';
import { addDays, dayDate, localDay } from '../../lib/day.ts';

export type CalendarEvent = inferRouterOutputs<AppRouter>['calendar']['range'][number];

/** What one day of the grid holds: an own event keeps its row for editing, a contribution is read only. */
export type DayEntry = (CalendarItem & { own?: undefined }) | (CalendarItem & { own: CalendarEvent });

/** The 42 days of a 6 by 7 month grid, Monday first, starting with the week the month begins in. */
export function monthDays(month: string) {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(localDay(first), -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export const monthOf = (day: string) => day.slice(0, 7);

/** The month `count` months from `month`, as `YYYY-MM`. */
export function shiftMonth(month: string, count: number) {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  return monthOf(localDay(new Date(year, monthNumber - 1 + count, 1)));
}

/**
 * Own events and every module's items grouped by day. Inside a day the ones with no time come first, then by time;
 * at the same time own events lead and the rest keep their order.
 */
export function entriesByDay(events: readonly CalendarEvent[], items: readonly CalendarItem[]) {
  const entries: DayEntry[] = [
    ...events.map((event): DayEntry => ({
      id: `event-${event.id}`,
      day: event.day,
      ...(event.start ? { time: event.start } : {}),
      title: event.title,
      kind: 'event',
      own: event,
    })),
    ...items,
  ];
  const days = new Map<string, DayEntry[]>();
  for (const entry of entries) days.set(entry.day, [...(days.get(entry.day) ?? []), entry]);
  for (const [day, list] of days)
    days.set(
      day,
      list.toSorted((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || Number(!!b.own) - Number(!!a.own)),
    );
  return days;
}

const dayLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const monthLong = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
export const dayTitle = (day: string) => dayLong.format(dayDate(day));
export const monthTitle = (month: string) => monthLong.format(dayDate(`${month}-01`));
