import assert from 'node:assert/strict';
import { delimiter } from 'node:path';
import { test } from 'node:test';
import { envWithNodeBin, run, streamSpawn } from './exec.ts';

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

void test('envWithNodeBin prepends the node bin directory once', () => {
  const execPath = '/opt/node/bin/node';
  const binDir = '/opt/node/bin';
  assert.equal(envWithNodeBin({ PATH: '/usr/bin' }, execPath).PATH, `${binDir}${delimiter}/usr/bin`);
  assert.equal(
    envWithNodeBin({ PATH: `/usr/bin${delimiter}${binDir}` }, execPath).PATH,
    `/usr/bin${delimiter}${binDir}`,
  );
  assert.equal(envWithNodeBin({}, execPath).PATH, binDir);
});

void test('streamSpawn emits stderr and a non-zero code when the binary is missing', async () => {
  const lines: Array<{ text: string; stream: 'stdout' | 'stderr' }> = [];
  const code = await new Promise<number | null>((resolve) => {
    streamSpawn(
      'hub-no-such-binary',
      [],
      (text, stream) => lines.push({ text, stream }),
      (exitCode) => resolve(exitCode),
    );
  });
  assert.notEqual(code, 0);
  assert.ok(lines.some((entry) => entry.stream === 'stderr' && entry.text.length > 0));
});
