import { and, eq, like } from 'drizzle-orm';
import type { Db } from '../db/index.ts';
import { pomodoroSessions } from '../db/schema.ts';

export function createFocusHistory(db: Db) {
  const listeners = new Set<(tag: string) => void>();
  return {
    minutesByTag(prefix: string) {
      const rows = db
        .select({ tag: pomodoroSessions.tag, durationMs: pomodoroSessions.durationMs })
        .from(pomodoroSessions)
        .where(
          and(
            eq(pomodoroSessions.kind, 'focus'),
            eq(pomodoroSessions.completed, true),
            like(pomodoroSessions.tag, `${prefix}%`),
          ),
        )
        .all();
      const result: Record<string, number> = {};
      for (const row of rows)
        if (row.tag?.startsWith(prefix)) result[row.tag] = (result[row.tag] ?? 0) + (row.durationMs ?? 0) / 60_000;
      return result;
    },
    changed(tag: string) {
      for (const listener of listeners) listener(tag);
    },
    subscribe(listener: (tag: string) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type FocusHistory = ReturnType<typeof createFocusHistory>;
