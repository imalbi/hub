import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfirmations } from './confirmations.ts';

void test('confirmation runs once; denial and expiry do not run it', async () => {
  let now = 0;
  let calls = 0;
  const pending = createConfirmations(() => now);
  assert.equal(
    pending.request({ agentId: 1, name: 'Agent', action: 'test', input: {}, run: async () => ++calls }),
    null,
  );
  const unsubscribe = pending.subscribe(() => {});
  const create = () =>
    pending.request({ agentId: 1, name: 'Agent', action: 'test', input: {}, run: async () => ++calls });
  const first = create();
  assert.ok(first);
  await pending.confirm(first);
  await assert.rejects(pending.confirm(first));
  assert.equal(calls, 1);
  assert.deepEqual(pending.status(first, 1), { state: 'confirmed', result: 1 });
  const second = create();
  assert.ok(second);
  pending.deny(second);
  assert.deepEqual(pending.status(second, 1), { state: 'denied' });
  const third = create();
  assert.ok(third);
  now = 120_001;
  assert.deepEqual(pending.status(third, 1), { state: 'expired' });
  await assert.rejects(pending.confirm(third));
  assert.equal(calls, 1);
  unsubscribe();
});

void test('finished entries are deleted after 10 minutes and status still answers as expired', async () => {
  let now = 0;
  const pending = createConfirmations(() => now);
  const unsubscribe = pending.subscribe(() => {});
  const create = () =>
    pending.request({ agentId: 1, name: 'Agent', action: 'test', input: {}, run: async () => 'done' });
  const done = create();
  const denied = create();
  const lapsed = create();
  assert.ok(done && denied && lapsed);
  await pending.confirm(done);
  pending.deny(denied);
  now = 120_001; // `lapsed` expires here
  assert.deepEqual(pending.status(lapsed, 1), { state: 'expired' });
  now += 10 * 60_000 + 1;
  const fresh = create(); // any request sweeps the old terminal entries
  assert.ok(fresh);
  for (const id of [done, denied, lapsed]) assert.deepEqual(pending.status(id, 1), { state: 'expired' });
  assert.throws(() => pending.status(fresh, 2), { code: 'NOT_FOUND' });
  unsubscribe();
});
