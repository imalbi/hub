import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { moduleImportViolation } from './module-imports.ts';

const script = fileURLToPath(new URL('./check-modules.ts', import.meta.url));
const passing =
  "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nvoid test('ok', () => {\n  assert.ok(true);\n});\n";
const failing =
  "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nvoid test('no', () => {\n  assert.equal(1, 2);\n});\n";

async function scratch(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'hub-check-modules-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function addModule(root: string, name: string, files: Record<string, string>) {
  await mkdir(join(root, name), { recursive: true });
  await writeFile(join(root, name, 'server.ts'), 'export default {};\n');
  for (const [file, source] of Object.entries(files)) await writeFile(join(root, name, file), source);
}

function check(root: string, ...args: string[]) {
  // Inside `node --test` this variable makes a nested `node --test` run as a child of the outer one, not on its own.
  const { NODE_TEST_CONTEXT: _outer, ...env } = process.env;
  const run = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...env, HUB_MODULES_ROOT: root },
  });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

void test('a module whose tests pass and whose types are sound is reported with counts only', async (t) => {
  const root = await scratch(t);
  await addModule(root, 'good', { 'a.test.ts': passing });
  const result = check(root);
  assert.equal(result.code, 0);
  assert.equal(result.out, 'check-modules: good: 1 tests passed in 1 files, typecheck and format ok\n');
});

void test('a failing private test fails the script and shows the failure', async (t) => {
  const root = await scratch(t);
  await addModule(root, 'bad', { 'a.test.ts': failing });
  const result = check(root);
  assert.equal(result.code, 1);
  assert.match(result.err, /bad: FAILED/);
});

void test('a type error in a private module fails the script', async (t) => {
  const root = await scratch(t);
  await addModule(root, 'typo', { 'a.ts': "export const n: number = 'text';\n" });
  const result = check(root);
  assert.equal(result.code, 1);
  assert.match(result.err, /typo: FAILED[\s\S]*TS2322/);
});

void test('a module name runs only that module; an unknown name lists the modules found', async (t) => {
  const root = await scratch(t);
  await addModule(root, 'good', { 'a.test.ts': passing });
  await addModule(root, 'bad', { 'a.test.ts': failing });
  assert.equal(check(root).code, 1);
  const one = check(root, 'good');
  assert.equal(one.code, 0);
  assert.doesNotMatch(one.out + one.err, /bad/);
  const unknown = check(root, 'nope');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /unknown module "nope"; found: bad, good/);
});

void test('a missing or empty private root is not a failure', async (t) => {
  const root = await scratch(t);
  for (const folder of [root, join(root, 'missing')]) {
    const result = check(folder);
    assert.equal(result.code, 0);
    assert.equal(result.out, 'check-modules: no private modules\n');
  }
});

void test('formatting is checked and can be fixed for a selected module', async (t) => {
  const root = await scratch(t);
  await addModule(root, 'good', { 'a.ts': 'export const value={one:1,two:2};\n' });
  assert.equal(check(root, 'good').code, 1);
  assert.equal(check(root, '--write', 'good').code, 0);
  assert.equal(check(root, 'good').code, 0);
});

void test('the script reaches the private root only through discovery, so it needs no exemption from the guard', async () => {
  assert.equal(moduleImportViolation('scripts/check-modules.ts', await readFile(script, 'utf8')), false);
});
