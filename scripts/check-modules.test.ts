import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkModules } from './check-modules.ts';
import { readPassStamps } from './verify-stamp.ts';
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
  assert.equal(result.out, 'check-modules: good: 1 tests passed in 1 files, typecheck, lint and format ok\n');
});

void test('gitignored catalog modules are linted and lint failures still block the check', async (t) => {
  const root = await scratch(t);
  assert.equal(spawnSync('git', ['init', '--quiet', root]).status, 0);
  await writeFile(join(root, '.gitignore'), 'catalog/\n');
  const catalog = join(root, 'catalog');
  await addModule(catalog, 'good', { 'a.test.ts': passing });
  const good = check(catalog);
  assert.equal(good.code, 0, good.err);
  assert.match(good.out, /good: 1 tests passed/);
  await writeFile(join(catalog, 'good', 'a.ts'), 'export function f(x: number) {\n  return x == 1;\n}\n');
  const bad = check(catalog);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /eqeqeq/);
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

void test('lint errors and unannotated dangerouslySetInnerHTML fail private module checks', async (t) => {
  const root = await scratch(t);
  await addModule(root, 'linty', { 'a.ts': 'export function f(x: number) {\n  return x == 1;\n}\n' });
  const badEq = check(root, 'linty');
  assert.equal(badEq.code, 1);
  assert.match(badEq.err, /linty: FAILED[\s\S]*eqeqeq/);

  await addModule(root, 'unsafe', {
    'ui.tsx': "export function View() {\n  return <div dangerouslySetInnerHTML={{ __html: '<p>hi</p>' }} />;\n}\n",
  });
  const badHtml = check(root, 'unsafe');
  assert.equal(badHtml.code, 1);
  assert.match(badHtml.err, /unsafe: FAILED[\s\S]*react\(no-danger\)/);
});

void test('the script reaches the private root only through discovery, so it needs no exemption from the guard', async () => {
  assert.equal(moduleImportViolation('scripts/check-modules.ts', await readFile(script, 'utf8')), false);
});

void test('checkModules scans multiple roots and gives earlier roots precedence on duplicates', async (t) => {
  const localRoot = await scratch(t);
  const installedRoot = await scratch(t);
  await addModule(localRoot, 'shared', { 'a.test.ts': passing });
  await addModule(installedRoot, 'shared', { 'a.test.ts': failing });
  await addModule(installedRoot, 'extra', { 'a.test.ts': passing });
  assert.equal(checkModules([localRoot, installedRoot]), 0);
});

void test('web build with HUB_MODULES_ROOT set to an empty fixture excludes modules.installed', async (t) => {
  const emptyRoot = await scratch(t);
  const installedFixture = await scratch(t);
  const outA = await scratch(t);
  const outB = await scratch(t);
  const sentinel = 'CATALOG_SENTINEL_98_UNIQUE';
  await addModule(installedFixture, 'sentinel', {
    'ui.tsx': `export default { name: 'sentinel', copy: { tag: '${sentinel}' } };\n`,
  });

  const repo = fileURLToPath(new URL('..', import.meta.url));
  const buildWith = (env: Record<string, string>, outDir: string) =>
    spawnSync('pnpm', ['--filter', '@hub/web', 'exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });

  const withFixture = buildWith(
    { HUB_MODULES_ROOT: emptyRoot, HUB_INSTALLED_MODULES_ROOT: installedFixture, HUB_EXAMPLE_MODULES: '0' },
    outA,
  );
  assert.equal(withFixture.status, 0, `${withFixture.stdout}${withFixture.stderr}`);
  const jsFilesA = readdirSync(join(outA, 'assets')).filter((f) => f.endsWith('.js'));
  const bundleA = (await Promise.all(jsFilesA.map((file) => readFile(join(outA, 'assets', file), 'utf8')))).join('\n');
  assert.equal(bundleA.includes(sentinel), true);

  const isolated = buildWith({ HUB_MODULES_ROOT: emptyRoot, HUB_EXAMPLE_MODULES: '0' }, outB);
  assert.equal(isolated.status, 0, `${isolated.stdout}${isolated.stderr}`);
  const jsFilesB = readdirSync(join(outB, 'assets')).filter((f) => f.endsWith('.js'));
  const bundleB = (await Promise.all(jsFilesB.map((file) => readFile(join(outB, 'assets', file), 'utf8')))).join('\n');
  assert.equal(bundleB.includes(sentinel), false);
});

void test('default-root module checks reuse passes while write, custom roots, failures and drift do not stamp', async (t) => {
  const dir = await scratch(t);
  const modules = join(dir, 'fixtures');
  await addModule(modules, 'good', {});
  await mkdir(join(dir, 'scripts'));
  await mkdir(join(dir, 'apps/server/src/core'), { recursive: true });
  await mkdir(join(dir, 'node_modules/.bin'), { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(join(dir, '.gitignore'), 'fixtures/\nnode_modules/\ncommands\n');
  for (const name of ['check-modules.ts', 'verify-stamp.ts'])
    await copyFile(new URL(name, import.meta.url), join(dir, 'scripts', name));
  await writeFile(join(dir, 'apps/server/src/core/discovery.ts'), "export const defaultModuleRoots = ['fixtures'];\n");
  for (const name of ['prettier', 'tsc', 'oxlint']) {
    const binary = join(dir, 'node_modules/.bin', name);
    await writeFile(
      binary,
      `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
const name = basename(process.argv[1]);
appendFileSync('commands', name + '\\n');
if (process.env.DRIFT && name === 'tsc') writeFileSync('fixtures/good/server.ts', 'drift');
if (process.env.FAIL_STEP === name) process.exit(1);
`,
    );
    await chmod(binary, 0o755);
  }
  const { NODE_TEST_CONTEXT: _outer, HUB_MODULES_ROOT: _root, ...env } = process.env;
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: dir, env: clean }).status, 0);
  const run = (args: string[] = [], extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, ['scripts/check-modules.ts', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...clean, HUB_VERIFY_NO_CACHE: '0', ...extra },
    });
  const stamps = join(dir, '.git/hub-pass-stamps.json');
  assert.equal(run().status, 0);
  assert.ok(readPassStamps(stamps)['check-module:good']);
  const cached = run();
  assert.equal(cached.status, 0);
  assert.match(cached.stdout, /cached \(unchanged\)/);
  await rm(stamps);
  assert.equal(run(['--write']).status, 0);
  assert.deepEqual(readPassStamps(stamps), {});
  assert.equal(run([], { HUB_MODULES_ROOT: modules }).status, 0);
  assert.deepEqual(readPassStamps(stamps), {});
  assert.equal(run([], { DRIFT: '1' }).status, 0);
  assert.deepEqual(readPassStamps(stamps), {});
  assert.equal(run([], { FAIL_STEP: 'tsc' }).status, 1);
  assert.deepEqual(readPassStamps(stamps), {});
});
