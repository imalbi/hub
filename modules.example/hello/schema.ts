import { integer, sqliteTable } from '../../apps/server/src/core/module-db.ts';

// One row per greeting: the count survives a restart, which the in-memory counter it replaces did not.
export const greetings = sqliteTable('greetings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  greetedAt: integer('greeted_at', { mode: 'timestamp_ms' }).notNull(),
});
