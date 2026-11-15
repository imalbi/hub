import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { Db } from '../../db/index.ts';
import { calendarEvents } from '../../db/schema.ts';
import { isDay } from '../notes/notes.ts';

export type CalendarEvent = {
  id: string;
  title: string;
  day: string;
  start: string | null;
  end: string | null;
  kind: 'event' | 'shift';
  person: string | null;
  source: string;
};
type Fields = {
  title: string;
  day: string;
  start?: string | null | undefined;
  end?: string | null | undefined;
  kind?: 'event' | 'shift' | undefined;
  person?: string | null | undefined;
};

/** True when the event has no end, or ends after it starts (an end with no start is refused by the router). */
export const endsAfterStart = (start: string | null | undefined, end: string | null | undefined) =>
  !end || (!!start && end > start);

export { isDay };

export const KIND_RULE =
  'An event ends after it starts; a shift needs a person, a start and an end (an end not after the start means the next day)';
/** The rules of a kind on a whole row: a shift needs its person and both times, an event ends after it starts. */
export const fitsKind = (row: {
  kind: 'event' | 'shift';
  person?: string | null | undefined;
  start?: string | null | undefined;
  end?: string | null | undefined;
}) => (row.kind === 'shift' ? !!row.person && !!row.start && !!row.end : endsAfterStart(row.start, row.end));

export function createCalendar(db: Db, now: () => Date = () => new Date()) {
  function existing(id: string) {
    const row = db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).get();
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown event' });
    return row;
  }

  return {
    /** Events from `from` to `to` inclusive (local days), soonest first; an event with no time leads its day. */
    range(from: string, to: string): CalendarEvent[] {
      return db
        .select()
        .from(calendarEvents)
        .where(and(isNull(calendarEvents.removedAt), gte(calendarEvents.day, from), lte(calendarEvents.day, to)))
        .orderBy(asc(calendarEvents.day), asc(calendarEvents.start), asc(calendarEvents.createdAt))
        .all()
        .map(({ id, title, day, start, end, kind, person, source }) => ({
          id,
          title,
          day,
          start,
          end,
          kind: kind === 'shift' ? 'shift' : 'event',
          person,
          source,
        }));
    },
    add(input: Fields, source: string) {
      const at = now();
      const id = randomUUID();
      db.insert(calendarEvents)
        .values({
          id,
          title: input.title,
          day: input.day,
          start: input.start ?? null,
          end: input.end ?? null,
          kind: input.kind ?? 'event',
          person: input.kind === 'shift' ? (input.person ?? null) : null,
          source,
          createdAt: at,
          updatedAt: at,
        })
        .run();
      return { id };
    },
    update(id: string, input: Fields) {
      const row = existing(id);
      // A missing kind keeps the stored one, and a shift keeps its person unless a new one is sent.
      const kind = input.kind ?? (row.kind === 'shift' ? 'shift' : 'event');
      const person = kind === 'shift' ? (input.person === undefined ? row.person : input.person) : null;
      if (!fitsKind({ kind, person, start: input.start, end: input.end }))
        throw new TRPCError({ code: 'BAD_REQUEST', message: KIND_RULE });
      db.update(calendarEvents)
        .set({
          title: input.title,
          day: input.day,
          start: input.start ?? null,
          end: input.end ?? null,
          kind,
          person,
          updatedAt: now(),
        })
        .where(eq(calendarEvents.id, id))
        .run();
    },
    setRemoved(id: string, removed: boolean) {
      existing(id);
      db.update(calendarEvents)
        .set({ removedAt: removed ? now() : null })
        .where(eq(calendarEvents.id, id))
        .run();
    },
  };
}

export type CalendarStore = ReturnType<typeof createCalendar>;
