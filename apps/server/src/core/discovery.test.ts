import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { FastifyBaseLogger } from 'fastify';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { discoverModules } from './discovery.ts';

// The private root may hold its own git repository: `.git` and other dot or non-module folders are not modules, and
// trying them logged "Module skipped" at every start.
void test('folders that cannot be module names are never tried, so a git repository in the root stays silent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['.git', '.cache', 'Not_A_Module']) await mkdir(join(root, folder));
  const warnings: unknown[] = [];
  const noop = () => {};
  const log: FastifyBaseLogger = {
    level: 'info',
    fatal: noop,
    error: noop,
    warn: (...args: unknown[]) => void warnings.push(args),
    info: noop,
    debug: noop,
    trace: noop,
    silent: noop,
    child: () => log,
  };
  const routers = await discoverModules({
    roots: [root],
    reserved: [],
    deps: { run: createFakeDesktop(), fetch, log, zones: new Set() },
    dbPath: ':memory:',
    config: {},
    onClose: () => {},
  });
  assert.deepEqual(Object.keys(routers), []);
  assert.deepEqual(warnings, []);
});
