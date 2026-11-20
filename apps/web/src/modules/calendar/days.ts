import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import type { CalendarItem } from '../../lib/module-ui.ts';
import { addDays, dayDate, localDay } from '../../lib/day.ts';

export type CalendarEvent = inferRouterOutputs<AppRouter>['calendar']['range'][number];

/** A shift is an own event; no other module contributes one. */
export type EntryKind = CalendarItem['kind'] | 'shift';
/**
 * What one day holds: an own event keeps its row for editing, a contribution is read only. A shift's `title` is its
 * person and `span` its text ("22:00 - 6:00"); `time` stays the start, for ordering.
 */
export type DayEntry = Omit<CalendarItem, 'kind'> & { kind: EntryKind; span?: string; own?: CalendarEvent };

/** Which kinds Settimana and Agenda show. Own events are always shown. */
export type Show = Record<'work' | 'study' | 'shift' | 'note', boolean>;
export const SHOW_ALL: Show = { work: true, study: true, shift: true, note: true };
export const filterEntries = (entries: readonly DayEntry[], show: Show) =>
  entries.filter((entry) => entry.kind === 'event' || show[entry.kind]);

/** "6:00 - 14:00" from `HH:MM` times; a shift ending at or before its start ends the next day, the text is the same. */
export const shiftSpan = (start: string, end: string) => `${start.replace(/^0/, '')} - ${end.replace(/^0/, '')}`;
/** The card's short form, as the week board writes it: "6-14", "22-6", "6:30-14" (whole hours lose their minutes). */
export const shortSpan = (start: string, end: string) => {
  const short = (time: string) => time.replace(/^0/, '').replace(/:00$/, '');
  return `${short(start)}-${short(end)}`;
};

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
    ...events.map((event): DayEntry =>
      event.kind === 'shift' && event.start && event.end
        ? {
            id: `event-${event.id}`,
            day: event.day,
            time: event.start,
            span: shiftSpan(event.start, event.end),
            title: event.person ?? event.title,
            kind: 'shift',
            own: event,
          }
        : {
            id: `event-${event.id}`,
            day: event.day,
            ...(event.start ? { time: event.start } : {}),
            title: event.title,
            kind: 'event',
            own: event,
          },
    ),
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

/** The Monday-first week the day is in: seven days. */
export function weekDays(day: string) {
  const start = addDays(day, -((dayDate(day).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

const dayMonth = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' });
const dayShortMonth = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
/** "16 - 22 novembre", or "26 ott - 1 nov" across two months. */
export function weekTitle(days: readonly string[]) {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  if (monthOf(first) === monthOf(last)) return `${Number(first.slice(8))} - ${dayMonth.format(dayDate(last))}`;
  return `${dayShortMonth.format(dayDate(first))} - ${dayShortMonth.format(dayDate(last))}`;
}

const weekdayShort = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long' });
export const weekdayName = (day: string) => weekdayShort.format(dayDate(day));
/** "lun 24" for the "Poi:" line. */
export const shortDay = (day: string) => `${weekdayShort.format(dayDate(day))} ${Number(day.slice(8))}`;

/**
 * The days of the agenda: from `from`, the next `limit` days, each with its entries; a day with none is left out.
 * A day with items always has them in the order `entriesByDay` gave.
 */
export function agendaDays(byDay: ReadonlyMap<string, DayEntry[]>, from: string, limit: number) {
  const days: Array<{ day: string; entries: DayEntry[] }> = [];
  for (let index = 0; index < limit; index += 1) {
    const day = addDays(from, index);
    const entries = byDay.get(day);
    if (entries?.length) days.push({ day, entries });
  }
  return days;
}

/** The agenda's first line of a day: Oggi and Domani for the first two days from today, then the weekday. */
export const agendaName = (day: string, today: string, words: { today: string; tomorrow: string }) =>
  day === today ? words.today : day === addDays(today, 1) ? words.tomorrow : weekdayLong.format(dayDate(day));
const agendaDate = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
/** "dom 15 nov" for Oggi and Domani, "17 nov" for the rest (the name already says the weekday). */
export const agendaDateText = (day: string, today: string) =>
  day === today || day === addDays(today, 1) ? agendaDate.format(dayDate(day)) : dayShortMonth.format(dayDate(day));

export const WIDGET_DAYS = 14;

/** "Oggi", "Domani", or "gio 19" for Calendario's Panoramica widgets. */
export const widgetDayLabel = (day: string, today: string, words: { today: string; tomorrow: string }) =>
  day === today ? words.today : day === addDays(today, 1) ? words.tomorrow : shortDay(day);

/** Upcoming calendar entries across the widget window in date/time order, excluding shifts (plan 55 decision 2). */
export function upcomingEntries(
  events: readonly CalendarEvent[],
  items: readonly CalendarItem[],
  today: string,
  days = WIDGET_DAYS,
): DayEntry[] {
  const byDay = new Map(
    [...entriesByDay(events, items)].map(([day, list]) => [day, filterEntries(list, { ...SHOW_ALL, shift: false })]),
  );
  return agendaDays(byDay, today, days).flatMap(({ entries }) => entries);
}

export type NextCalendarEntry = { kind: 'timed' | 'dated'; entry: DayEntry };

/** Next timed entry from now on, falling back to the first upcoming dated entry when none has a time ahead. */
export function nextCalendarEntry(
  entries: readonly DayEntry[],
  today: string,
  nowTime: string,
): NextCalendarEntry | null {
  const ahead = entries.filter((entry) => entry.day > today || entry.time === undefined || entry.time >= nowTime);
  const timed = ahead.find((entry) => entry.time !== undefined);
  if (timed) return { kind: 'timed', entry: timed };
  const dated = ahead[0];
  return dated ? { kind: 'dated', entry: dated } : null;
}
