import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { moduleDbPath, openDatabase, openDb } from './index.ts';
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

void test('a module database path sits next to the core file, and stays in memory with an in-memory core', () => {
  assert.equal(moduleDbPath(':memory:', 'notes'), ':memory:');
  assert.equal(moduleDbPath('/state/hub/hub.db', 'notes'), '/state/hub/modules/notes.db');
});

void test('a failed migration closes the handle and rethrows; a missing folder is a failure too', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-db-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '20261105000000_bad'), { recursive: true });
  await writeFile(join(root, '20261105000000_bad', 'migration.sql'), 'this is not sql;');
  const close = t.mock.method(DatabaseSync.prototype, 'close');
  assert.throws(() => openDatabase(':memory:', root));
  assert.equal(close.mock.callCount(), 1);
  assert.throws(() => openDatabase(':memory:', join(root, 'missing')));
  assert.equal(close.mock.callCount(), 2);
});
