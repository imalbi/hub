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

// A post-it: short text for a local calendar day (`YYYY-MM-DD`). Removing sets `removedAt`, so Annulla can bring it back.
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  forDay: text('for_day').notNull(),
  // `desk` for the owner, `agent:<name>` for a note an MCP agent added.
  source: text('source').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
});

// An event the owner (or an agent) put on the calendar: a local day (`YYYY-MM-DD`) and optional `HH:MM` times.
// `source` is `desk`, `agent:<name>`, or later the name of an import. Removing sets `removedAt`, so Annulla can bring it back.
export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  day: text('day').notNull(),
  start: text('start'),
  end: text('end'),
  // `event`, or `shift` (a person's work span, shown in the week and the agenda, never in the month grid). A shift may end the next day.
  kind: text('kind').notNull().default('event'),
  person: text('person'),
  source: text('source').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
});
