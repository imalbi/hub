import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const agentCalls = sqliteTable('agent_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: integer('agent_id'),
  name: text('name').notNull(),
  action: text('action').notNull(),
  input: text('input').notNull(),
  result: text('result').notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  status: text('status').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  exitCode: integer('exit_code'),
  output: text('output').notNull().default('[]'),
});

export const pomodoroSessions = sqliteTable('pomodoro_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['focus', 'break'] }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  tag: text('tag'),
  durationMs: integer('duration_ms'),
});

// The Pomodoro settings saved from the UI, one row (id 1). Absent means the config defaults and sound on.
export const pomodoroSettings = sqliteTable('pomodoro_settings', {
  id: integer('id').primaryKey(),
  focusMinutes: real('focus_minutes').notNull(),
  shortBreakMinutes: real('short_break_minutes').notNull(),
  longBreakMinutes: real('long_break_minutes').notNull(),
  longBreakEvery: integer('long_break_every').notNull(),
  sound: integer('sound', { mode: 'boolean' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// A paired phone or tablet. Only the SHA-256 of its token is stored, so a leaked database cannot be replayed.
export const devices = sqliteTable('devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
});

// The owner's own themes. `values` is validated by `themeValuesSchema` on the way in and out; only hex colors reach CSS.
export const themes = sqliteTable('themes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // The theme it was duplicated from (`ink`, `paper`, `moss`, `stone`, `caelestia` or a custom id), for the picker only.
  base: text('base').notNull(),
  values: text('values', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// The widget board of a desk zone, one row per zone. `items` is validated by `layoutItemsSchema` on the way in and out.
export const deskLayouts = sqliteTable('desk_layouts', {
  zone: text('zone').primaryKey(),
  items: text('items', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
