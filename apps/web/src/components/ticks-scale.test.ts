import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { tickScale } from './ticks-scale.ts';

void test('ticks clamp filled marks to the available discrete count', () => {
  assert.deepEqual(tickScale(2, 6), { count: 6, filled: 2 });
  assert.deepEqual(tickScale(10, 6), { count: 6, filled: 6 });
  assert.deepEqual(tickScale(-1, 6), { count: 6, filled: 0 });
});
