import { createFocusHistory } from './focus-history.ts';
import { openDb } from '../db/index.ts';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { FastifyBaseLogger } from 'fastify';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { emptyConfig } from './config.ts';
import { buildServer } from '../server.ts';
import { discoverModules } from './discovery.ts';
import { createModuleStates } from './module-states.ts';

const noop = () => {};

// The private root may hold its own git repository: `.git` and other dot or non-module folders are not modules, and
// trying them logged "Module skipped" at every start.
void test('folders that cannot be module names are never tried, so a git repository in the root stays silent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['.git', '.cache', 'Not_A_Module']) await mkdir(join(root, folder));
  const warnings: unknown[] = [];
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
    deps: {
      run: createFakeDesktop(),
      fetch,
      log,
      zones: new Set(),
      focusHistory: createFocusHistory(openDb(':memory:')),
    },
    dbPath: ':memory:',
    config: {},
    onClose: () => {},
  });
  assert.deepEqual(Object.keys(routers), []);
  assert.deepEqual(warnings, []);
});

void test('a module that fails is reported as failed and its log line carries no payload', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-discovery-failed-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const api = new URL('./module.ts', import.meta.url).href;
  await mkdir(join(root, 'picky'));
  await writeFile(
    join(root, 'picky', 'server.ts'),
    `import { defineModule, z } from ${JSON.stringify(api)};
     export default defineModule({ name: 'picky', config: z.object({ count: z.number() }), create: () => { throw new Error('never created'); } });`,
  );
  const warnings: unknown[] = [];
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
  const states = createModuleStates();
  await discoverModules({
    roots: [root],
    reserved: [],
    deps: {
      run: createFakeDesktop(),
      fetch,
      log,
      zones: new Set(),
      focusHistory: createFocusHistory(openDb(':memory:')),
    },
    dbPath: ':memory:',
    config: { picky: { count: 'PAYLOAD-MARKER' } },
    onClose: () => {},
    states,
  });
  const [picky] = states.list();
  assert.equal(picky?.name, 'picky');
  assert.equal(picky?.status, 'failed');
  assert.ok(picky.schema, 'a failed module keeps its schema so settings can fix it');
  assert.equal(JSON.stringify(warnings).includes('PAYLOAD-MARKER'), false);
  assert.equal(warnings.length, 1);
});

void test('an off discovered module is not created and its database file is left as it was', async (t) => {
  const state = await mkdtemp(join(tmpdir(), 'hub-discovery-off-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const dbPath = join(state, 'hub.db');
  const moduleDb = join(state, 'modules', 'hello.db');
  const build = (modulesOff: string[]) =>
    buildServer({
      dbPath,
      deps: { run: createFakeDesktop() },
      exampleModules: true,
      config: { ...emptyConfig, modulesOff },
    });
  const greet = (app: ReturnType<typeof build>) =>
    app.inject({
      method: 'POST',
      url: '/trpc/hello.greet',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });

  // Off from the first start: the module's file is never even created.
  const fresh = build(['hello']);
  assert.equal((await fresh.inject('/trpc/hello.state')).statusCode, 404);
  await fresh.close();
  await assert.rejects(stat(moduleDb));

  // On: it writes data. Off again: same bytes and mtime. On again: the data is back.
  const on = build([]);
  assert.equal((await greet(on)).statusCode, 200);
  await on.close();
  const before = { bytes: await readFile(moduleDb), mtime: (await stat(moduleDb)).mtimeMs };
  const off = build(['hello']);
  assert.equal((await off.inject('/trpc/hello.state')).statusCode, 404);
  const listed = (await off.inject('/trpc/settings.modules')).json().result.data;
  assert.deepEqual(
    listed.find((m: { name: string }) => m.name === 'hello'),
    { name: 'hello', kind: 'private', status: 'off', hasConfig: true },
  );
  await off.close();
  assert.deepEqual(await readFile(moduleDb), before.bytes);
  assert.equal((await stat(moduleDb)).mtimeMs, before.mtime);
  const back = build([]);
  t.after(() => back.close());
  assert.equal((await back.inject('/trpc/hello.state')).json().result.data.count, 1);
});
