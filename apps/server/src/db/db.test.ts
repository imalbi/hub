import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from './index.ts';
import { pomodoroSessions } from './schema.ts';

void test('migrations apply and a row round-trips', async () => {
  const db = openDb(':memory:');
  const startedAt = new Date('2026-11-04T10:00:00Z');
  await db.insert(pomodoroSessions).values({ kind: 'focus', startedAt });
  const rows = await db.select().from(pomodoroSessions);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, 'focus');
  assert.equal(rows[0]?.completed, false);
  assert.deepEqual(rows[0]?.startedAt, startedAt);
  db.$client.close();
});
