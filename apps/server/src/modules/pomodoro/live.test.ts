import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { emptyConfig } from '../../core/config.ts';
import { openDb } from '../../db/index.ts';
import { pomodoroSessions } from '../../db/schema.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { createPomodoro } from './live.ts';

afterEach(() => mock.timers.reset());

void test('a timeout completes, persists, notifies and pushes without a polling interval', async (t) => {
  mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: new Date(2026, 10, 4, 10) });
  const db = openDb(':memory:');
  const notifications: string[][] = [];
  const timer = createPomodoro(db, createFakeDesktop({ notifications }), {
    ...emptyConfig.pomodoro,
    focusMinutes: 0.05,
  });
  t.after(() => {
    timer.close();
    db.$client.close();
  });
  const abort = new AbortController();
  const sub = timer.subscribe(abort.signal);
  assert.equal((await sub.next()).value?.phase, 'idle');
  const started = sub.next();
  timer.act('start');
  assert.equal((await started).value?.phase, 'focus');
  const ended = sub.next();
  mock.timers.tick(3000);
  await flush();
  assert.equal((await ended).value?.phase, 'break');
  assert.equal(timer.state().completedFocusToday, 1);
  const rows = db.select().from(pomodoroSessions).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.completed, true);
  assert.equal(rows[0]?.endedAt?.getTime(), Date.now());
  assert.deepEqual(notifications, [['--app-name', 'Hub', 'Concentrazione completata', 'È il momento di una pausa.']]);
  const idle = sub.next();
  mock.timers.tick(300_000);
  await flush();
  assert.equal((await idle).value?.phase, 'idle');
  assert.deepEqual(notifications.at(-1), ['--app-name', 'Hub', 'Pausa terminata', 'Puoi iniziare una nuova sessione.']);
  assert.deepEqual(
    db
      .select()
      .from(pomodoroSessions)
      .all()
      .map((row) => [row.kind, row.completed]),
    [
      ['focus', true],
      ['break', true],
    ],
  );
  abort.abort();
  await sub.return();
});

void test('pause cancels expiry, resume reschedules, skip and stop store incomplete rows', (t) => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 10, 4, 10) });
  const db = openDb(':memory:');
  const notifications: string[][] = [];
  const timer = createPomodoro(db, createFakeDesktop({ notifications }), {
    ...emptyConfig.pomodoro,
    focusMinutes: 0.05,
  });
  t.after(() => {
    timer.close();
    db.$client.close();
  });
  timer.act('start');
  mock.timers.tick(1000);
  timer.act('pause');
  mock.timers.tick(10_000);
  assert.equal(timer.state().pausedRemainingMs, 2000);
  assert.equal(db.select().from(pomodoroSessions).all().length, 0);
  timer.act('resume');
  mock.timers.tick(1999);
  assert.equal(timer.state().phase, 'focus');
  timer.act('skip');
  timer.act('stop');
  assert.equal(notifications.length, 0);
  assert.deepEqual(
    db
      .select()
      .from(pomodoroSessions)
      .all()
      .map((row) => [row.kind, row.completed]),
    [
      ['focus', false],
      ['break', false],
    ],
  );
});

void test('history is counted by local completion day and resets at midnight even while idle', async (t) => {
  const now = new Date(2026, 10, 4, 23, 59, 59).getTime();
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const db = openDb(':memory:');
  db.insert(pomodoroSessions)
    .values([
      { kind: 'focus', startedAt: new Date(now - 1000), endedAt: new Date(now), completed: true },
      { kind: 'focus', startedAt: new Date(2026, 10, 3), endedAt: new Date(2026, 10, 3), completed: true },
      { kind: 'focus', startedAt: new Date(now), endedAt: new Date(now), completed: false },
    ])
    .run();
  const timer = createPomodoro(db, createFakeDesktop(), emptyConfig.pomodoro);
  t.after(() => {
    timer.close();
    db.$client.close();
  });
  const abort = new AbortController();
  const sub = timer.subscribe(abort.signal);
  assert.equal((await sub.next()).value?.completedFocusToday, 1);
  const changed = sub.next();
  mock.timers.tick(1000);
  await flush();
  assert.equal((await changed).value?.completedFocusToday, 0);
  abort.abort();
  await sub.return();
});

void test('completed history from earlier days restores the long-break cycle', (t) => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 10, 4, 10) });
  const db = openDb(':memory:');
  db.insert(pomodoroSessions)
    .values(
      Array.from({ length: 3 }, (): typeof pomodoroSessions.$inferInsert => ({
        kind: 'focus',
        startedAt: new Date(2026, 10, 3),
        endedAt: new Date(2026, 10, 3),
        completed: true,
      })),
    )
    .run();
  const timer = createPomodoro(db, createFakeDesktop(), { ...emptyConfig.pomodoro, focusMinutes: 0.05 });
  t.after(() => {
    timer.close();
    db.$client.close();
  });
  assert.equal(timer.state().completedFocusToday, 0);
  timer.act('start');
  mock.timers.tick(3000);
  assert.equal(timer.state().durationMs, 900_000);
  assert.equal(timer.state().completedFocusToday, 1);
});
