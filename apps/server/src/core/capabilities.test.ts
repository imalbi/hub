import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCapabilityRegistry } from './capabilities.ts';

void test('capabilities preserve their contract, reject duplicates and leave missing entries undefined', () => {
  const registry = createCapabilityRegistry<{ clock: { now: () => number } }>();
  const clock = { now: () => 42 };
  assert.equal(registry.get('clock'), undefined);
  assert.equal(registry.has('clock'), false);
  registry.register('clock', clock);
  assert.equal(registry.get('clock'), clock);
  assert.equal(registry.get('clock')?.now(), 42);
  assert.deepEqual(registry.list(), ['clock']);
  assert.throws(() => registry.register('clock', clock), /Duplicate capability/);
});
