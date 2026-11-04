import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTimer, timerState, transition, type Timer, type TimerAction } from './timer.ts';

const config = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 };
const now = new Date(2026, 10, 4, 10).getTime();
function move(timer: Timer, action: TimerAction, at: number, settings = config) {
  const result = transition(timer, action, settings, at);
  assert.ok(result, `${timer.phase}: ${action}`);
  return result;
}

void test('start, pause and resume preserve the focus time left', () => {
  const started = move(createTimer(now), 'start', now).timer;
  assert.equal(started.endsAt, now + 1_500_000);
  const paused = move(started, 'pause', now + 60_000).timer;
  assert.equal(paused.endsAt, null);
  assert.equal(paused.pausedRemainingMs, 1_440_000);
  const resumed = move(paused, 'resume', now + 600_000).timer;
  assert.equal(resumed.endsAt, now + 2_040_000);
  assert.equal(resumed.startedAt, now);
  assert.equal(resumed.durationMs, 1_500_000);
  assert.equal(resumed.pausedRemainingMs, null);
});

void test('focus completion starts a short break, break completion returns idle', () => {
  const focus = move(createTimer(now), 'start', now).timer;
  const end = now + 1_500_000;
  const finished = move(focus, 'complete', end);
  assert.deepEqual(finished.ended, { kind: 'focus', startedAt: now, endedAt: end, completed: true });
  assert.equal(finished.timer.phase, 'break');
  assert.equal(finished.timer.endsAt, end + 300_000);
  assert.equal(finished.timer.completedFocusToday, 1);
  const idle = move(finished.timer, 'complete', end + 300_000);
  assert.equal(idle.timer.phase, 'idle');
  assert.equal(idle.ended?.kind, 'break');
  assert.equal(idle.ended?.completed, true);
});

void test('the fourth completed focus starts a long break, then the cycle repeats', () => {
  let timer = createTimer(now);
  let at = now;
  for (let completed = 1; completed <= 5; completed++) {
    timer = move(timer, 'start', at).timer;
    at += 1_500_000;
    timer = move(timer, 'complete', at).timer;
    assert.equal(timer.endsAt, at + (completed === 4 ? 900_000 : 300_000));
    timer = move(timer, 'skip', at).timer;
  }
});

void test('configured durations and a restored completion cycle choose the next break', () => {
  const settings = { focusMinutes: 2, shortBreakMinutes: 1, longBreakMinutes: 3, longBreakEvery: 2 };
  const started = transition(createTimer(now, 0, 1), 'start', settings, now);
  assert.ok(started);
  assert.equal(started.timer.endsAt, now + 120_000);
  const completed = transition(started.timer, 'complete', settings, now + 120_000);
  assert.ok(completed);
  assert.equal(completed.timer.durationMs, 180_000);
  assert.equal(completed.timer.completedFocusToday, 1);
});

void test('skip and stop record incomplete phases without adding a completed focus', () => {
  const focus = move(createTimer(now), 'start', now).timer;
  const skipped = move(focus, 'skip', now + 1000);
  assert.equal(skipped.timer.phase, 'break');
  assert.equal(skipped.ended?.completed, false);
  assert.equal(skipped.timer.completedFocusToday, 0);
  const stoppedBreak = move(skipped.timer, 'stop', now + 2000);
  assert.equal(stoppedBreak.timer.phase, 'idle');
  assert.equal(stoppedBreak.ended?.kind, 'break');
  const stoppedFocus = move(move(focus, 'pause', now + 1000).timer, 'stop', now + 5000);
  assert.equal(stoppedFocus.timer.phase, 'idle');
  assert.equal(stoppedFocus.ended?.completed, false);
});

void test('all invalid transitions are rejected, including early or paused completion', () => {
  const idle = createTimer(now);
  const running = move(idle, 'start', now).timer;
  const paused = move(running, 'pause', now + 1000).timer;
  const invalid: [Timer, TimerAction[]][] = [
    [idle, ['pause', 'resume', 'skip', 'stop', 'complete']],
    [running, ['start', 'resume', 'complete']],
    [paused, ['start', 'pause', 'complete']],
  ];
  for (const [timer, actions] of invalid)
    for (const action of actions) {
      assert.equal(transition(timer, action, config, now + 2000), null, `${timer.phase}: ${action}`);
    }
});

void test('breaks can be paused, resumed and skipped', () => {
  const focus = move(createTimer(now), 'start', now).timer;
  const rest = move(focus, 'skip', now + 1000).timer;
  const paused = move(rest, 'pause', now + 2000).timer;
  assert.equal(paused.pausedRemainingMs, 299_000);
  const resumed = move(paused, 'resume', now + 5000).timer;
  assert.equal(resumed.endsAt, now + 304_000);
  assert.equal(move(resumed, 'skip', now + 6000).timer.phase, 'idle');
});

void test('today resets at local midnight, and a focus finishing after midnight counts for the new day', () => {
  const late = new Date(2026, 10, 4, 23, 59).getTime();
  const midnight = new Date(2026, 10, 5).getTime();
  const running = move(createTimer(late, 3), 'start', late).timer;
  assert.equal(timerState(running, midnight).completedFocusToday, 0);
  assert.equal(move(running, 'complete', late + 1_500_000).timer.completedFocusToday, 1);
  assert.equal(move(running, 'complete', late + 1_500_000).timer.durationMs, 900_000);
});

void test('longBreakEvery 0 never schedules a long break', () => {
  const settings = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 15, longBreakEvery: 0 };
  let timer = createTimer(now);
  let at = now;
  for (let completed = 1; completed <= 8; completed++) {
    timer = move(timer, 'start', at, settings).timer;
    at += 3_000_000;
    timer = move(timer, 'complete', at, settings).timer;
    assert.equal(timer.durationMs, 600_000);
    timer = move(timer, 'stop', at, settings).timer;
  }
});
