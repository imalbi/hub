import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig } from './core/config.ts';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';
void test('example module contributes state and an action through the module factory', async (t) => {
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    moduleRoots: [],
    exampleModules: true,
  });
  t.after(() => app.close());
  assert.equal((await app.inject('/trpc/hello.state')).statusCode, 200);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/trpc/hello.greet',
        headers: { 'content-type': 'application/json' },
        payload: {},
      })
    ).statusCode,
    200,
  );
});

void test('discovery isolates broken imports, bad config, collisions and malformed cleanup while retaining valid modules', async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'hub-modules-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const api = new URL('./core/module.ts', import.meta.url).href;
  const trpc = new URL('./core/trpc.ts', import.meta.url).href;
  const prefix = `import { defineModule, z } from ${JSON.stringify(api)}; import { router, protectedProcedure } from ${JSON.stringify(trpc)};`;
  const valid = `defineModule({ name: 'sample', zones: ['sample'], config: z.object({ value: z.string() }), create: ({ config }) => ({ router: router({ state: protectedProcedure.query(() => config.value) }) }) })`;
  const fixtures: Record<string, string> = {
    broken: 'throw new Error("broken import");',
    badconfig: `${prefix} export default defineModule({ name: 'invalid', config: z.object({ required: z.string() }), create: () => { throw new Error('must never create'); } });`,
    collision: `${prefix} export default defineModule({ name: 'audio', create: () => ({ router: router({}) }) });`,
    invalidclose: `export default { name: 'badclose', create: () => ({ router: null, close: 'invalid' }) };`,
    throwingclose: `export default { name: 'badcleanup', create: () => ({ router: null, close: () => { throw new Error('cleanup failed'); } }) };`,
    valid: `${prefix} export default ${valid};`,
    // Folders load in name order: `zeta` comes after `valid`, so it is the one that meets a zone already taken.
    zeta: `${prefix} export default defineModule({ name: 'zeta', zones: ['sample'], create: () => ({ router: router({ state: protectedProcedure.query(() => 'zeta') }) }) });`,
    reserved: `${prefix} export default defineModule({ name: 'reserved', zones: ['work'], create: () => ({ router: router({ state: protectedProcedure.query(() => 'reserved') }) }) });`,
    // A module zone's id is its path (`/desk/<id>`), so the path of a built-in page is taken too.
    slug: `${prefix} export default defineModule({ name: 'slug', zones: ['lavoro'], create: () => ({ router: router({ state: protectedProcedure.query(() => 'slug') }) }) });`,
  };
  for (const [name, source] of Object.entries(fixtures)) {
    await mkdir(join(root, name));
    await writeFile(join(root, name, 'server.ts'), source);
  }
  const app = buildServer({
    dbPath: ':memory:',
    moduleRoots: [root],
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, modules: { sample: { value: 'fixture' } } },
  });
  t.after(() => app.close());
  const state = await app.inject('/trpc/sample.state');
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.json(), { result: { data: 'fixture' } });
  for (const name of ['invalid', 'badclose', 'badcleanup'])
    assert.equal((await app.inject(`/trpc/${name}.state`)).statusCode, 404);
  assert.equal((await app.inject('/trpc/audio.state')).statusCode, 200);
  // A zone is registered by the module that declares it first; a built-in zone id is never free.
  for (const name of ['zeta', 'reserved', 'slug'])
    assert.equal((await app.inject(`/trpc/${name}.state`)).statusCode, 404);
});

void test('onlyModules loads the named folders of a root and leaves the others alone', async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'hub-modules-only-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const api = new URL('./core/module.ts', import.meta.url).href;
  const trpc = new URL('./core/trpc.ts', import.meta.url).href;
  const source = (name: string) =>
    `import { defineModule } from ${JSON.stringify(api)}; import { router, protectedProcedure } from ${JSON.stringify(trpc)};
     export default defineModule({ name: '${name}', create: () => ({ router: router({ state: protectedProcedure.query(() => '${name}') }) }) });`;
  for (const name of ['kept', 'ignored']) {
    await mkdir(join(root, name));
    await writeFile(join(root, name, 'server.ts'), source(name));
  }
  const app = buildServer({
    dbPath: ':memory:',
    moduleRoots: [root],
    onlyModules: ['kept'],
    deps: { run: createFakeDesktop() },
  });
  t.after(() => app.close());
  assert.equal((await app.inject('/trpc/kept.state')).statusCode, 200);
  assert.equal((await app.inject('/trpc/ignored.state')).statusCode, 404);
});

void test('modulesOff leaves a public module uncreated: its calls are NOT_FOUND and settings.modules says off', async (t) => {
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, modulesOff: ['news'] },
  });
  t.after(() => app.close());
  assert.equal((await app.inject('/trpc/news.state')).statusCode, 404);
  assert.equal((await app.inject('/trpc/audio.state')).statusCode, 200);
  const modules = (await app.inject('/trpc/settings.modules')).json().result.data;
  assert.deepEqual(
    modules.find((m: { name: string }) => m.name === 'news'),
    { name: 'news', kind: 'public', status: 'off', hasConfig: true },
  );
  assert.equal(modules.find((m: { name: string }) => m.name === 'audio').status, 'on');
  // The protected list a phone may read carries names only, and not the module that is off.
  const enabled = (await app.inject('/trpc/modules.enabled')).json().result.data;
  assert.ok(enabled.includes('audio') && !enabled.includes('news'));
});

void test('multi-root discovery loads from both roots and gives localRoot precedence over installedRoot', async (t) => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const localRoot = await mkdtemp(join(tmpdir(), 'hub-local-root-'));
  const installedRoot = await mkdtemp(join(tmpdir(), 'hub-installed-root-'));
  t.after(async () => {
    await rm(localRoot, { recursive: true, force: true });
    await rm(installedRoot, { recursive: true, force: true });
  });
  const api = JSON.stringify(new URL('./core/module.ts', import.meta.url).href);
  const trpc = JSON.stringify(new URL('./core/trpc.ts', import.meta.url).href);
  const writeMod = async (root: string, folder: string, name: string, value: string) => {
    await mkdir(join(root, folder), { recursive: true });
    await writeFile(
      join(root, folder, 'server.ts'),
      `import { defineModule } from ${api}; import { router, protectedProcedure } from ${trpc};
       export default defineModule({ name: ${JSON.stringify(name)}, create: () => ({ router: router({ state: protectedProcedure.query(() => ${JSON.stringify(value)}) }) }) });`,
    );
  };
  await writeMod(localRoot, 'local-only', 'local-only', 'local');
  await writeMod(localRoot, 'shared', 'shared', 'from-local');
  await writeMod(localRoot, 'shadowed-off', 'shadowed-off', 'off-local');
  await writeMod(installedRoot, 'installed-only', 'installed-only', 'installed');
  await writeMod(installedRoot, 'shared', 'shared', 'from-installed');
  await writeMod(installedRoot, 'shadowed-off', 'shadowed-off', 'from-installed-off');

  const app = buildServer({
    dbPath: ':memory:',
    moduleRoots: [localRoot, installedRoot],
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, modulesOff: ['shadowed-off'] },
  });
  t.after(() => app.close());

  assert.equal((await app.inject('/trpc/local-only.state')).json().result.data, 'local');
  assert.equal((await app.inject('/trpc/installed-only.state')).json().result.data, 'installed');
  assert.equal((await app.inject('/trpc/shared.state')).json().result.data, 'from-local');
  assert.equal((await app.inject('/trpc/shadowed-off.state')).statusCode, 404);
});
