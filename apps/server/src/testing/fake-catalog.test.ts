import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createFakeCatalog } from './fake-catalog.ts';

void test('fake Git writes isolated catalogs and keeps failed syncs from replacing their version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hub-catalog-fixture-'));
  const fake = createFakeCatalog();
  try {
    assert.equal((await fake.run('git', ['clone', '--', 'https://example.com/catalog.git', root])).code, 0);
    assert.match(await readFile(join(root, 'hub-catalog.json'), 'utf8'), /1\.0\.0/);
    fake.control.version = '1.1.0';
    fake.control.failSync = true;
    assert.equal((await fake.run('git', ['-C', root, 'reset', '--hard'])).code, 1);
    assert.doesNotMatch(await readFile(join(root, 'hub-catalog.json'), 'utf8'), /1\.1\.0/);
    fake.control.failSync = false;
    await fake.run('git', ['-C', root, 'reset', '--hard']);
    assert.match(await readFile(join(root, 'hub-catalog.json'), 'utf8'), /1\.1\.0/);
    assert.equal((await fake.run('git', ['-C', root, 'rev-parse', 'HEAD'])).stdout.trim(), 'b'.repeat(40));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
