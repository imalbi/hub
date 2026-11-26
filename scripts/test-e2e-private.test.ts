import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findPrivateE2eFolders } from './test-e2e-private.ts';

import { readPassStamps } from './verify-stamp.ts';

const script = fileURLToPath(new URL('./test-e2e-private.ts', import.meta.url));

async function scratch(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'hub-test-e2e-private-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

void test('findPrivateE2eFolders returns empty array when root does not exist', () => {
  assert.deepEqual(findPrivateE2eFolders('/nonexistent/path/for/hub/tests'), []);
});

void test('findPrivateE2eFolders returns only modules that have an e2e folder', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'mod-a', 'e2e'), { recursive: true });
  await mkdir(join(root, 'mod-b'), { recursive: true });
  const found = findPrivateE2eFolders(root);
  assert.deepEqual(found, [{ name: 'mod-a', path: join(root, 'mod-a', 'e2e') }]);
});

void test('findPrivateE2eFolders scans multiple roots with first-root precedence', async (t) => {
  const localRoot = await scratch(t);
  const installedRoot = await scratch(t);
  await mkdir(join(localRoot, 'mod-a', 'e2e'), { recursive: true });
  await mkdir(join(installedRoot, 'mod-a', 'e2e'), { recursive: true });
  await mkdir(join(installedRoot, 'mod-b', 'e2e'), { recursive: true });
  assert.deepEqual(findPrivateE2eFolders([localRoot, installedRoot]), [
    { name: 'mod-a', path: join(localRoot, 'mod-a', 'e2e') },
    { name: 'mod-b', path: join(installedRoot, 'mod-b', 'e2e') },
  ]);
});

void test('CLI exits 0 when no private e2e folders exist', async (t) => {
  const root = await scratch(t);
  const run = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, HUB_MODULES_ROOT: root, HUB_E2E_PRIVATE: '' },
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /no private e2e folders found; skipping/);
});

void test('CLI exits 1 when a requested module has no e2e folder', async (t) => {
  const root = await scratch(t);
  const run = spawnSync(process.execPath, [script, 'unknown-mod'], {
    encoding: 'utf8',
    env: { ...process.env, HUB_MODULES_ROOT: root, HUB_E2E_PRIVATE: '' },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /module "unknown-mod" has no e2e\/ folder/);
});

void test('dedicated private runs share stamps, separate visual passes and reject failure or drift', async (t) => {
  const dir = await scratch(t);
  await mkdir(join(dir, 'scripts'));
  await mkdir(join(dir, 'apps/server/src/core'), { recursive: true });
  await mkdir(join(dir, 'ignored/demo/e2e'), { recursive: true });
  await mkdir(join(dir, 'bin'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(join(dir, '.gitignore'), 'ignored/\nbin/\n');
  await writeFile(join(dir, 'ignored/demo/server.ts'), 'first');
  for (const name of ['test-e2e-private.ts', 'verify-stamp.ts'])
    await copyFile(new URL(name, import.meta.url), join(dir, 'scripts', name));
  await writeFile(join(dir, 'apps/server/src/core/discovery.ts'), "export const defaultModuleRoots = ['ignored'];\n");
  const pnpm = join(dir, 'bin/pnpm');
  await writeFile(
    pnpm,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
if (process.env.DRIFT) writeFileSync('ignored/demo/server.ts', 'drift');
if (process.env.FAIL_RUN) process.exit(7);
`,
  );
  await chmod(pnpm, 0o755);
  const { HUB_MODULES_ROOT: _root, HUB_E2E_PRIVATE: _private, ...env } = process.env;
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: dir, env: clean }).status, 0);
  const run = (extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, ['scripts/test-e2e-private.ts', 'demo'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...clean,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        HUB_VERIFY_NO_CACHE: '0',
        HUB_E2E_SKIP_VISUAL: '0',
        ...extra,
      },
    });
  const stamps = join(dir, '.git/hub-pass-stamps.json');
  assert.equal(run({ HUB_E2E_SKIP_VISUAL: '1' }).status, 0);
  assert.ok(readPassStamps(stamps)['e2e:private-demo:novisual']);
  assert.equal(run({ FAIL_RUN: '1' }).status, 7);
  assert.equal(readPassStamps(stamps)['e2e:private-demo'], undefined);
  assert.equal(run().status, 0);
  const cached = run({ HUB_E2E_PRIVATE: join(dir, 'ignored/demo/e2e'), FAIL_RUN: '1' });
  assert.equal(cached.status, 0);
  assert.match(cached.stdout, /skipped \(cached\)/);
  await rm(stamps);
  assert.equal(run({ DRIFT: '1' }).status, 0);
  assert.deepEqual(readPassStamps(stamps), {});
});
