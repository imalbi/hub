import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pomodoroSessions = sqliteTable('pomodoro_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['focus', 'break'] }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
});
