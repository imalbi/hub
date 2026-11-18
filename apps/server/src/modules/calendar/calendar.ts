import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { Db } from '../../db/index.ts';
import { calendarEvents, calendarSeries, calendarSeriesSkips } from '../../db/schema.ts';
import { expandSeries, type Series } from './series.ts';
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
  seriesId: string | null;
  seriesDay: string | null;
  series: Series | null;
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

export type SeriesFields = Omit<Series, 'id' | 'source'>;

export function createCalendar(db: Db, now: () => Date = () => new Date()) {
  function existing(id: string) {
    const row = db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).get();
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown event' });
    return row;
  }

  function existingSeries(id: string) {
    const row = db.select().from(calendarSeries).where(eq(calendarSeries.id, id)).get();
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown series' });
    return row;
  }

  return {
    /** Stored events and bounded virtual occurrences, sorted by day and time. */
    range(from: string, to: string): CalendarEvent[] {
      const allSeries = db.select().from(calendarSeries).all();
      const live = allSeries.filter((row) => !row.removedAt).map(toSeries);
      const skips = db.select().from(calendarSeriesSkips).all();
      const events: CalendarEvent[] = db
        .select()
        .from(calendarEvents)
        .where(and(isNull(calendarEvents.removedAt), gte(calendarEvents.day, from), lte(calendarEvents.day, to)))
        .orderBy(asc(calendarEvents.day), asc(calendarEvents.start), asc(calendarEvents.createdAt))
        .all()
        .map(({ id, title, day, start, end, kind, person, source, seriesId, seriesDay }) => {
          const series = live.find((row) => row.id === seriesId) ?? null;
          return {
            id,
            title,
            day,
            start,
            end,
            kind: kind === 'shift' ? 'shift' : 'event',
            person,
            source,
            seriesId: series?.id ?? null,
            seriesDay: series ? seriesDay : null,
            series,
          };
        });
      const expanded = live.flatMap((series) =>
        expandSeries(
          series,
          from,
          to,
          skips.filter((skip) => skip.seriesId === series.id).map((skip) => skip.day),
        ).map((event) => ({ ...event, series })),
      );
      return [...events, ...expanded].toSorted(
        (a, b) => a.day.localeCompare(b.day) || (a.start ?? '').localeCompare(b.start ?? ''),
      );
    },
    addSeries(input: SeriesFields, source: string) {
      const id = randomUUID();
      const at = now();
      db.insert(calendarSeries)
        .values({ ...input, id, source, createdAt: at, updatedAt: at })
        .run();
      return { id };
    },
    updateSeries(id: string, input: Partial<SeriesFields>) {
      const row = existingSeries(id);
      const merged = { ...toSeries(row), ...input };
      validateSeries(merged);
      db.update(calendarSeries)
        .set({ ...input, updatedAt: now() })
        .where(eq(calendarSeries.id, id))
        .run();
    },
    setSeriesRemoved(id: string, removed: boolean) {
      existingSeries(id);
      db.update(calendarSeries)
        .set({ removedAt: removed ? now() : null, updatedAt: now() })
        .where(eq(calendarSeries.id, id))
        .run();
    },
    editOccurrence(seriesId: string, day: string, fields: Fields | null) {
      const series = toSeries(existingSeries(seriesId));
      if (!expandSeries(series, day, day, []).length)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Day is not an occurrence of this series' });
      if (
        fields &&
        !fitsKind({
          ...fields,
          kind: fields.kind ?? series.kind,
          person: fields.person === undefined ? series.person : fields.person,
        })
      )
        throw new TRPCError({ code: 'BAD_REQUEST', message: KIND_RULE });
      db.transaction((tx) => {
        tx.delete(calendarEvents)
          .where(and(eq(calendarEvents.seriesId, seriesId), eq(calendarEvents.seriesDay, day)))
          .run();
        tx.insert(calendarSeriesSkips).values({ seriesId, day }).onConflictDoNothing().run();
        if (fields) {
          const kind = fields.kind ?? series.kind;
          const at = now();
          tx.insert(calendarEvents)
            .values({
              id: randomUUID(),
              title: fields.title,
              day: fields.day,
              start: fields.start ?? null,
              end: fields.end ?? null,
              kind,
              person: kind === 'shift' ? (fields.person === undefined ? series.person : fields.person) : null,
              source: series.source,
              seriesId,
              seriesDay: day,
              createdAt: at,
              updatedAt: at,
            })
            .run();
        }
      });
    },
    restoreOccurrence(seriesId: string, day: string) {
      existingSeries(seriesId);
      db.transaction((tx) => {
        tx.delete(calendarEvents)
          .where(and(eq(calendarEvents.seriesId, seriesId), eq(calendarEvents.seriesDay, day)))
          .run();
        tx.delete(calendarSeriesSkips)
          .where(and(eq(calendarSeriesSkips.seriesId, seriesId), eq(calendarSeriesSkips.day, day)))
          .run();
      });
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

function toSeries(row: typeof calendarSeries.$inferSelect): Series {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind === 'shift' ? 'shift' : 'event',
    person: row.person,
    days: row.days,
    fromDay: row.fromDay,
    untilDay: row.untilDay,
    source: row.source,
  };
}

export function validateSeries(series: SeriesFields) {
  if (
    (series.untilDay && series.untilDay < series.fromDay) ||
    !series.days.length ||
    new Set(series.days.map((day) => day.weekday)).size !== series.days.length ||
    series.days.some((day) => !fitsKind({ ...day, kind: series.kind, person: series.person }))
  )
    throw new TRPCError({ code: 'BAD_REQUEST', message: KIND_RULE });
}
