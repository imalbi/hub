import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from './exec.ts';

void test('run captures stdout and the exit code without throwing on failure', async () => {
  const ok = await run(process.execPath, ['-e', 'process.stdout.write("hi")']);
  assert.deepEqual(ok, { stdout: 'hi', stderr: '', code: 0 });

  const failed = await run(process.execPath, ['-e', 'process.exit(3)']);
  assert.equal(failed.code, 3);
});

void test('run reports a missing binary and a timeout as a non-zero code', async () => {
  assert.notEqual((await run('hub-no-such-binary', [])).code, 0);
  assert.notEqual((await run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 100 })).code, 0);
});
