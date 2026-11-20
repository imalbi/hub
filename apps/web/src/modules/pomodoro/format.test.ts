import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusMinutesToday, formatPomodoroTag } from './format.ts';

void test('formatPomodoroTag strips study prefix and joins segments', () => {
  assert.equal(formatPomodoroTag(null), null);
  assert.equal(formatPomodoroTag(undefined), null);
  assert.equal(formatPomodoroTag(''), null);
  assert.equal(formatPomodoroTag('study/'), null);
  assert.equal(formatPomodoroTag('study/Chimica/G3'), 'Chimica · G3');
  assert.equal(formatPomodoroTag('study/G1'), 'G1');
  assert.equal(formatPomodoroTag('deep/work'), 'deep · work');
});

void test('focusMinutesToday sums durations in rounded minutes and clamps negative ranges', () => {
  const base = 1_700_000_000_000;
  assert.equal(focusMinutesToday([]), 0);
  assert.equal(
    focusMinutesToday([
      { startedAt: base, endedAt: base + 25 * 60_000 },
      { startedAt: base + 30 * 60_000, endedAt: base + 55 * 60_000 },
      { startedAt: base + 60_000, endedAt: base },
    ]),
    50,
  );
});
