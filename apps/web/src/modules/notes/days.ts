import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import { addDays, dayDate, localDay } from '../../lib/day.ts';

export type Note = inferRouterOutputs<AppRouter>['notes']['open'][number];

/**
 * The notes Oggi shows on `today`: every one whose day is today or earlier, those for today first. The input is
 * newest first and the order inside each group is kept. `upcoming` is the rest, soonest day first.
 */
export function splitNotes(notes: readonly Note[], today: string) {
  const due = notes.filter((note) => note.forDay <= today);
  return {
    due: [...due.filter((note) => note.forDay === today), ...due.filter((note) => note.forDay < today)],
    upcoming: notes.filter((note) => note.forDay > today).toSorted((a, b) => a.forDay.localeCompare(b.forDay)),
  };
}

/** When a note was written, as what Oggi says about it: nothing for today, "yesterday", or the day. */
export function writtenOn(note: Note, today: string) {
  const day = localDay(new Date(note.createdAt));
  return day === today
    ? ({ kind: 'today' } as const)
    : day === addDays(today, -1)
      ? ({ kind: 'yesterday' } as const)
      : ({ kind: 'day', day } as const);
}

/** The agent behind a note, or null for one typed on the desk. */
export function agentName(note: Note) {
  return note.source.startsWith('agent:') ? note.source.slice('agent:'.length) : null;
}

const dayName = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric' });
const dayShort = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' });

/** A later day as the widget says it: "Domani", else the weekday and the date ("giovedì 19"). */
export function laterDay(day: string, today: string, short = false) {
  if (day === addDays(today, 1) && !short) return 'domani';
  return (short ? dayShort : dayName).format(dayDate(day));
}
