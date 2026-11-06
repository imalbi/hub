import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findPrivateE2eFolders } from './test-e2e-private.ts';

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
