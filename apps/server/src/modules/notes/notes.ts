import { randomUUID } from 'node:crypto';
import { desc, eq, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { Db } from '../../db/index.ts';
import { notes } from '../../db/schema.ts';
import { createLiveHub } from '../../core/live.ts';

const pad = (value: number) => String(value).padStart(2, '0');

/** A local calendar day as `YYYY-MM-DD`, in the server's time zone. */
export function localDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True for a day that exists on the calendar, not just one that looks like a date. */
export function isDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export type Note = { id: string; text: string; forDay: string; source: string; createdAt: number };

export function createNotes(db: Db, now: () => Date = () => new Date()) {
  function read(): Note[] {
    return db
      .select()
      .from(notes)
      .where(isNull(notes.removedAt))
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .all()
      .map((row) => ({
        id: row.id,
        text: row.text,
        forDay: row.forDay,
        source: row.source,
        createdAt: row.createdAt.getTime(),
      }));
  }
  const live = createLiveHub(async () => read(), null);

  function existing(id: string) {
    const row = db.select().from(notes).where(eq(notes.id, id)).get();
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown note' });
    return row;
  }

  return {
    open: read,
    subscribe: live.subscribe,
    async add(input: { text: string; forDay?: string | undefined }, source: string) {
      const at = now();
      const id = randomUUID();
      db.insert(notes)
        .values({
          id,
          text: input.text,
          forDay: input.forDay ?? localDay(at),
          source,
          createdAt: at,
          updatedAt: at,
        })
        .run();
      await live.notify();
      return { id };
    },
    async edit(input: { id: string; text: string; forDay?: string | undefined }) {
      const row = existing(input.id);
      db.update(notes)
        .set({ text: input.text, forDay: input.forDay ?? row.forDay, updatedAt: now() })
        .where(eq(notes.id, input.id))
        .run();
      await live.notify();
    },
    async setRemoved(id: string, removed: boolean) {
      existing(id);
      db.update(notes)
        .set({ removedAt: removed ? now() : null })
        .where(eq(notes.id, id))
        .run();
      await live.notify();
    },
  };
}

export type NotesStore = ReturnType<typeof createNotes>;
