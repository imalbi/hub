import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { moduleDbPath, openDatabase, openDb } from './index.ts';
import { deskLayouts, pomodoroSessions } from './schema.ts';

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

void test('the migration that retires the zone boards deletes every layout but the overview one', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-db-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const core = fileURLToPath(new URL('../../drizzle', import.meta.url));
  const folders = await readdir(core);
  const retire = folders.find((name) => name.endsWith('_overview_only_layouts'));
  assert.ok(retire, 'the migration exists');
  // The database as it was before the step: every migration except the new one, with a board for each old zone.
  const before = join(root, 'before');
  for (const name of folders.filter((folder) => folder !== retire))
    await cp(join(core, name), join(before, name), { recursive: true });
  const file = join(root, 'state', 'hub.db');
  const old = openDatabase(file, before);
  const updatedAt = new Date('2026-11-05T10:00:00Z');
  for (const zone of ['overview', 'study', 'media', 'system', 'devices'])
    old
      .insert(deskLayouts)
      .values({ zone, items: [{ widget: 'pomodoro', size: 'medium', x: 0, y: 0 }], updatedAt })
      .run();
  old.$client.close();
  const db = openDb(file);
  t.after(() => db.$client.close());
  assert.deepEqual(
    db
      .select()
      .from(deskLayouts)
      .all()
      .map((row) => row.zone),
    ['overview'],
  );
});
