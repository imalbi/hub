import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dayPosition } from './day-line-math.ts';

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
