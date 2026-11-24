import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import {
  copyModuleAtomically,
  deriveSourceId,
  parseCatalogManifest,
  resolveSafeModulePath,
} from './catalog-manifest.ts';

async function scratch(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-catalog-manifest-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

void test('parseCatalogManifest validates version 1 manifests and rejects invalid or reserved entries', () => {
  const valid = parseCatalogManifest({
    version: 1,
    name: 'Shared Modules',
    description: 'Trusted modules catalog',
    modules: [
      {
        name: 'alpha-mod',
        title: 'Alpha',
        description: 'First module',
        version: '1.0.0',
        path: 'modules/alpha',
        minHubVersion: '0.1.0',
      },
    ],
  });
  assert.equal(valid.modules.length, 1);
  assert.equal(valid.modules[0]?.name, 'alpha-mod');

  assert.throws(() => parseCatalogManifest({ version: 2, name: 'x', description: 'y', modules: [] }));
  assert.throws(() => parseCatalogManifest({ version: 1, name: 'x', description: 'y', modules: [], extra: true }));

  for (const badName of ['catalog', 'settings', 'UpperCase', '1mod', 'then', '__proto__']) {
    assert.throws(
      () =>
        parseCatalogManifest({
          version: 1,
          name: 'x',
          description: 'y',
          modules: [{ name: badName, title: 'T', description: 'D', version: '1.0.0', path: 'mod' }],
        }),
      badName,
    );
  }

  for (const badPath of ['../escape', 'a/../b', '/abs/path', 'C:\\win', 'a\\b', 'mod\0x', './dot', '']) {
    assert.throws(
      () =>
        parseCatalogManifest({
          version: 1,
          name: 'x',
          description: 'y',
          modules: [{ name: 'good-mod', title: 'T', description: 'D', version: '1.0.0', path: badPath }],
        }),
      badPath,
    );
  }

  assert.throws(() =>
    parseCatalogManifest({
      version: 1,
      name: 'x',
      description: 'y',
      modules: [
        { name: 'dup', title: 'T1', description: 'D1', version: '1.0.0', path: 'a' },
        { name: 'dup', title: 'T2', description: 'D2', version: '1.0.0', path: 'b' },
      ],
    }),
  );
});

void test('resolveSafeModulePath requires server.ts inside repo root and rejects any symlink', async (t) => {
  const dir = await scratch(t);
  const repo = join(dir, 'repo');
  const outside = join(dir, 'outside');
  await mkdir(join(repo, 'good'), { recursive: true });
  await writeFile(join(repo, 'good', 'server.ts'), 'export default {};\n');
  await mkdir(join(repo, 'missing-server'), { recursive: true });
  await mkdir(join(repo, 'has-symlink'), { recursive: true });
  await writeFile(join(repo, 'has-symlink', 'server.ts'), 'export default {};\n');
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'secret.txt'), 'secret');
  await symlink(join(outside, 'secret.txt'), join(repo, 'has-symlink', 'leak.txt'));
  await symlink(outside, join(repo, 'link-dir'));

  const resolved = await resolveSafeModulePath(repo, 'good');
  assert.equal(resolved, join(repo, 'good'));

  await assert.rejects(() => resolveSafeModulePath(repo, 'missing-server'));
  await assert.rejects(() => resolveSafeModulePath(repo, 'has-symlink'));
  await assert.rejects(() => resolveSafeModulePath(repo, 'link-dir'));
});

void test('copyModuleAtomically stages, swaps cleanly, and leaves no temp or backup leftovers', async (t) => {
  const dir = await scratch(t);
  const srcV1 = join(dir, 'src-v1');
  const srcV2 = join(dir, 'src-v2');
  const installed = join(dir, 'installed');
  await mkdir(join(srcV1, 'sub'), { recursive: true });
  await writeFile(join(srcV1, 'server.ts'), '// v1\n');
  await writeFile(join(srcV1, 'sub', 'helper.ts'), 'export const v = 1;\n');
  await mkdir(srcV2, { recursive: true });
  await writeFile(join(srcV2, 'server.ts'), '// v2\n');

  await copyModuleAtomically(srcV1, installed, 'sample');
  assert.equal(await readFile(join(installed, 'sample', 'server.ts'), 'utf8'), '// v1\n');
  assert.equal(await readFile(join(installed, 'sample', 'sub', 'helper.ts'), 'utf8'), 'export const v = 1;\n');

  await copyModuleAtomically(srcV2, installed, 'sample');
  assert.equal(await readFile(join(installed, 'sample', 'server.ts'), 'utf8'), '// v2\n');
  await assert.rejects(() => lstat(join(installed, 'sample', 'sub')));

  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(installed), ['sample']);
});

void test('deriveSourceId normalizes slugs and avoids collisions', () => {
  const used = new Set<string>();
  const first = deriveSourceId('https://example.com/org/Hub-Shared.git', used);
  assert.equal(first, 'hub-shared');
  used.add(first);
  const second = deriveSourceId('https://example.com/other/Hub-Shared.git', used);
  assert.notEqual(second, first);
  assert.match(second, /^[a-z0-9][a-z0-9-]{0,47}$/);
});

void test('manifest accepts dependency metadata and semver ranges while rejecting invalid ranges', () => {
  const entry = {
    name: 'sample',
    title: 'Sample',
    description: 'Module',
    version: '1.0.0',
    path: 'sample',
    provides: ['clock'],
    requires: ['base'],
    optional: { mail: 'Collega i messaggi' },
    minHubVersion: '>=0.1.0 <2.0.0',
  };
  const manifest = { version: 1, name: 'Catalog', description: 'Modules', modules: [entry] };
  assert.deepEqual(parseCatalogManifest(manifest).modules[0], entry);
  for (const minHubVersion of ['invalid', '1.broken', ''])
    assert.throws(() => parseCatalogManifest({ ...manifest, modules: [{ ...entry, minHubVersion }] }));
});

void test('catalog module source rejects node_modules and package.json without a regular lockfile', async (t) => {
  const root = await scratch(t);
  const module = join(root, 'sample');
  await mkdir(module);
  await writeFile(join(module, 'server.ts'), 'export default {};');
  await writeFile(join(module, 'package.json'), '{}');
  await assert.rejects(() => resolveSafeModulePath(root, 'sample'), /pnpm-lock.yaml/);
  await writeFile(join(module, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0');
  assert.equal(await resolveSafeModulePath(root, 'sample'), module);
  await mkdir(join(module, 'node_modules'));
  await assert.rejects(() => resolveSafeModulePath(root, 'sample'), /node_modules/);
});
