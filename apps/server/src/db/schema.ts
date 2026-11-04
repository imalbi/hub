import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pomodoroSessions = sqliteTable('pomodoro_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['focus', 'break'] }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
});

// A paired phone or tablet. Only the SHA-256 of its token is stored, so a leaked database cannot be replayed.
export const devices = sqliteTable('devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
});
