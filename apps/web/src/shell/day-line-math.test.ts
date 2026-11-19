import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dayPosition, packCaptions } from './day-line-math.ts';

void test('day line clamps before six and positions the current local time', () => {
  assert.equal(dayPosition(new Date(2026, 10, 17, 5).getTime()), 0);
  assert.equal(dayPosition(new Date(2026, 10, 17, 10).getTime()), 4 / 18);
  assert.ok(
    Math.abs(
      dayPosition(new Date(2026, 10, 17, 19, 40).getTime()) -
        dayPosition(new Date(2026, 10, 17, 18, 40).getTime()) -
        1 / 18,
    ) < 1e-10,
  );
});

void test('captions pack into two rows, shorten when crowded and stay inside the ruler', () => {
  const packed = packCaptions(500, [
    { x: 100, width: 100, shortWidth: 30 },
    { x: 130, width: 100, shortWidth: 30 },
    { x: 160, width: 100, shortWidth: 30 },
    { x: 400, width: 120, shortWidth: 30 },
  ]);
  assert.deepEqual(packed, [
    { x: 100, row: 0, short: false },
    { x: 130, row: 1, short: false },
    { x: 200, row: 0, short: true },
    { x: 380, row: 0, short: false },
  ]);
});
