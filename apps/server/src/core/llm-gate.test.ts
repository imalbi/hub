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

void test('calls wait in FIFO order and start at least the configured interval apart', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 });
  const gate = createLlmGate();
  let finish: (() => void) | undefined;
  const starts: number[] = [];
  const first = gate(
    3,
    () => {
      starts.push(Date.now());
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    { minIntervalMs: 4_000 },
  );
  const second = gate(
    3,
    () => {
      starts.push(Date.now());
      return Promise.resolve();
    },
    { minIntervalMs: 4_000 },
  );
  assert.deepEqual(starts, [100_000]);
  assert.equal(gate.used(), 1);
  finish?.();
  await first;
  await Promise.resolve();
  t.mock.timers.tick(3_999);
  await Promise.resolve();
  assert.deepEqual(starts, [100_000]);
  t.mock.timers.tick(1);
  await second;
  assert.deepEqual(starts, [100_000, 104_000]);
  assert.equal(gate.used(), 2);
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
  let started = false;
  const second = gate(3, () => {
    started = true;
    return Promise.resolve();
  });
  assert.equal(started, false);
  finish?.();
  await second;
  assert.equal(started, true);
});
