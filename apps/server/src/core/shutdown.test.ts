import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { createShutdown } from './shutdown.ts';

void test('shutdown waits for cleanup once, keeping the first requested exit code', async (t) => {
  const exits: number[] = [];
  t.mock.method(process, 'exit', (code: number) => exits.push(code));
  let finish: (() => void) | undefined;
  let calls = 0;
  const shutdown = createShutdown(
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    (error) => assert.fail(String(error)),
  );
  shutdown(42);
  shutdown();
  assert.equal(calls, 1);
  assert.deepEqual(exits, []);
  finish?.();
  await flush();
  assert.deepEqual(exits, [42]);
});

void test('shutdown reports failed cleanup and exits unsuccessfully', async (t) => {
  const exits: number[] = [];
  const errors: unknown[] = [];
  t.mock.method(process, 'exit', (code: number) => exits.push(code));
  const failure = new Error('cleanup failed');
  createShutdown(
    () => Promise.reject(failure),
    (error) => errors.push(error),
  )();
  await flush();
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(exits, [1]);
});

void test('shutdown exits after 15 seconds if cleanup is stuck', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const exits: number[] = [];
  t.mock.method(process, 'exit', (code: number) => exits.push(code));
  createShutdown(
    () => new Promise(() => {}),
    (error) => assert.fail(String(error)),
  )();
  t.mock.timers.tick(14_999);
  assert.deepEqual(exits, []);
  t.mock.timers.tick(1);
  assert.deepEqual(exits, [1]);
});
