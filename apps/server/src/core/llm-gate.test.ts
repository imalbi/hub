import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLlmGate } from './llm-gate.ts';

void test('the daily cap blocks calls and resets on the next local day', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 0, 1, 12) });
  const gate = createLlmGate();
  let calls = 0;
  const call = () => Promise.resolve(++calls);
  assert.equal(await gate(2, call), 1);
  assert.equal(await gate(2, call), 2);
  await assert.rejects(gate(2, call), { reason: 'cap' });
  assert.equal(calls, 2);
  t.mock.timers.setTime(new Date(2026, 0, 2, 12).getTime());
  assert.equal(await gate(2, call), 3);
});

void test('another call is refused while a call is in flight', async () => {
  const gate = createLlmGate();
  let finish: (() => void) | undefined;
  const first = gate(
    3,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await assert.rejects(
    gate(3, () => Promise.resolve()),
    { reason: 'busy' },
  );
  finish?.();
  await first;
});

void test('the timeout aborts the provider and rejects', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = createLlmGate();
  let signal: AbortSignal | undefined;
  const result = gate(1, (s) => {
    signal = s;
    return new Promise<void>(() => {});
  });
  t.mock.timers.tick(30_000);
  await assert.rejects(result, { reason: 'timeout' });
  assert.equal(signal?.aborted, true);
});

void test('a timed-out call stays in flight until its provider settles', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = createLlmGate();
  let finish: (() => void) | undefined;
  const first = gate(
    3,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  t.mock.timers.tick(30_000);
  await assert.rejects(first, { reason: 'timeout' });
  await assert.rejects(
    gate(3, () => Promise.resolve()),
    { reason: 'busy' },
  );
  finish?.();
  await Promise.resolve();
  await gate(3, () => Promise.resolve());
});
