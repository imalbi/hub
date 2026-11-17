import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { smallestWidgetSize } from './widget-size.ts';

void test('picks the smallest area regardless of size order', () => {
  assert.equal(smallestWidgetSize(['wide', 'large', 'small']), 'small');
});
