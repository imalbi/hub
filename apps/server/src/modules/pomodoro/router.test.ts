import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { z } from 'zod';
import { emptyConfig } from '../../config.ts';
import { createFakeDesktop } from '../../fake-desktop.ts';
import { buildServer } from '../../server.ts';

process.env.NODE_ENV = 'test';
const response = z.object({
  result: z.object({ data: z.object({ phase: z.string(), completedFocusToday: z.number() }) }),
});

void test('HTTP actions validate transitions and trust, complete to history, and restart idle with today preserved', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-pomodoro-'));
  const dbPath = join(root, 'history.db');
  const notifications: string[][] = [];
  const options = {
    dbPath,
    run: createFakeDesktop({ notifications }),
    config: { ...emptyConfig, pomodoro: { ...emptyConfig.pomodoro, focusMinutes: 0.05 } },
  };
  const app = buildServer(options);
  t.after(async () => {
    mock.timers.reset();
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  await app.ready();
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 10, 4, 10) });
  const invalid = await app.inject({
    method: 'POST',
    url: '/trpc/pomodoro.pause',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(invalid.statusCode, 412);
  for (const path of ['state', 'start', 'pause', 'resume', 'skip', 'stop']) {
    const rejected = await app.inject({
      method: path === 'state' ? 'GET' : 'POST',
      url: `/trpc/pomodoro.${path}`,
      remoteAddress: '192.0.2.20',
      headers: { 'content-type': 'application/json' },
      payload: path === 'state' ? undefined : '{}',
    });
    assert.equal(rejected.statusCode, 401, path);
  }
  const started = await app.inject({
    method: 'POST',
    url: '/trpc/pomodoro.start',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(started.statusCode, 200);
  mock.timers.tick(3000);
  await flush();
  const state = response.parse((await app.inject('/trpc/pomodoro.state')).json()).result.data;
  assert.equal(state.phase, 'break');
  assert.equal(state.completedFocusToday, 1);
  assert.equal(notifications.length, 1);
  const db = new DatabaseSync(dbPath);
  assert.deepEqual(
    db
      .prepare('SELECT kind, completed FROM pomodoro_sessions')
      .all()
      .map((row) => [row.kind, row.completed]),
    [['focus', 1]],
  );
  db.close();
  await app.close();
  const restarted = buildServer(options);
  t.after(() => restarted.close());
  const restored = response.parse((await restarted.inject('/trpc/pomodoro.state')).json()).result.data;
  assert.equal(restored.phase, 'idle');
  assert.equal(restored.completedFocusToday, 1);
});

void test('a missing notification binary never interrupts a completed phase', async (t) => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 10, 4, 10) });
  const app = buildServer({
    dbPath: ':memory:',
    run: async () => ({ stdout: '', stderr: 'missing', code: -1 }),
    config: { ...emptyConfig, pomodoro: { ...emptyConfig.pomodoro, focusMinutes: 0.05 } },
  });
  t.after(async () => {
    await app.close();
    mock.timers.reset();
  });
  await app.inject({
    method: 'POST',
    url: '/trpc/pomodoro.start',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  mock.timers.tick(3000);
  const data = response.parse((await app.inject('/trpc/pomodoro.state')).json()).result.data;
  assert.equal(data.phase, 'break');
  assert.equal(data.completedFocusToday, 1);
});
