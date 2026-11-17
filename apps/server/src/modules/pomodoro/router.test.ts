import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { z } from 'zod';
import { emptyConfig } from '../../core/config.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
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
    deps: { run: createFakeDesktop({ notifications }) },
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
    url: '/trpc/pomodoro.startTagged',
    headers: { 'content-type': 'application/json' },
    payload: { tag: 'study/example/A01' },
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
      .prepare('SELECT kind, completed, tag FROM pomodoro_sessions')
      .all()
      .map((row) => [row.kind, row.completed, row.tag]),
    [['focus', 1, 'study/example/A01']],
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
    deps: { run: async () => ({ stdout: '', stderr: 'missing', code: -1 }) },
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

void test('configure validates the limits of the config schema', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, config: emptyConfig });
  t.after(() => app.close());
  const configure = (input: object) =>
    app.inject({
      method: 'POST',
      url: '/trpc/pomodoro.configure',
      headers: { 'content-type': 'application/json' },
      payload: input,
    });
  const valid = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 15, longBreakEvery: 0, sound: true };
  assert.equal((await configure(valid)).statusCode, 200);
  for (const invalid of [
    { focusMinutes: 0 },
    { shortBreakMinutes: 1441 },
    { longBreakEvery: -1 },
    { longBreakEvery: 1.5 },
    { sound: 'yes' },
  ]) {
    assert.equal((await configure({ ...valid, ...invalid })).statusCode, 400, JSON.stringify(invalid));
  }
});

void test('today returns completed focus sessions ending today in start order with their tags', async (t) => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 4, 18) });
  const root = mkdtempSync(join(tmpdir(), 'hub-pomodoro-today-'));
  const dbPath = join(root, 'history.db');
  const app = buildServer({ dbPath, deps: { run: createFakeDesktop() }, config: emptyConfig });
  t.after(async () => {
    await app.close();
    mock.timers.reset();
    rmSync(root, { recursive: true, force: true });
  });
  await app.ready();
  const db = new DatabaseSync(dbPath);
  const insert = db.prepare(
    'INSERT INTO pomodoro_sessions (kind, started_at, ended_at, completed, tag) VALUES (?, ?, ?, ?, ?)',
  );
  const time = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
  insert.run('focus', time(4, 11), time(4, 11, 25), 1, null);
  insert.run('break', time(4, 10, 25), time(4, 10, 30), 1, null);
  insert.run('focus', time(3, 10), time(3, 10, 25), 1, 'yesterday');
  insert.run('focus', time(4, 12), time(4, 12, 25), 0, 'incomplete');
  insert.run('focus', time(4, 10), time(4, 10, 25), 1, 'study/example');
  db.close();
  const result = await app.inject('/trpc/pomodoro.today');
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json().result.data, [
    { startedAt: time(4, 10), endedAt: time(4, 10, 25), tag: 'study/example' },
    { startedAt: time(4, 11), endedAt: time(4, 11, 25), tag: null },
  ]);
  assert.equal((await app.inject({ url: '/trpc/pomodoro.today', remoteAddress: '192.0.2.20' })).statusCode, 401);
});
