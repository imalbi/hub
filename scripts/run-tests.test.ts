import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { expandGlobs, extractTestCount } from './run-tests.ts';

const script = fileURLToPath(new URL('./run-tests.ts', import.meta.url));

function nestedEnv(): NodeJS.ProcessEnv {
  const { NODE_TEST_CONTEXT: _outer, ...rest } = process.env;
  return rest;
}

void test('G7: unmatched glob exits non-zero, 0-test summary fails, passing fixture passes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-run-tests-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  assert.deepEqual(expandGlobs(['missing/**/*.test.ts'], dir), []);
  const unmatched = spawnSync(process.execPath, [script, 'missing/**/*.test.ts'], {
    cwd: dir,
    encoding: 'utf8',
    env: nestedEnv(),
  });
  assert.equal(unmatched.status, 1);
  assert.match(unmatched.stderr, /no test files matched/);

  assert.equal(extractTestCount('TAP version 13\n1..0\n# tests 0\n'), 0);
  assert.equal(extractTestCount('\x1b[34mℹ\x1b[39m tests 87\n'), 87);

  writeFileSync(
    join(dir, 'sample.test.ts'),
    "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nvoid test('ok', () => assert.ok(true));\n",
  );
  const passing = spawnSync(process.execPath, [script, '*.test.ts'], {
    cwd: dir,
    encoding: 'utf8',
    env: nestedEnv(),
  });
  assert.equal(passing.status, 0, `${passing.stdout}${passing.stderr}`);
});
