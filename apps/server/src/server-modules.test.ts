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
  assert.equal(
    (await app.inject(`/trpc/layout.get?input=${encodeURIComponent(JSON.stringify({ zone: 'sample' }))}`)).statusCode,
    200,
  );
  assert.equal(
    (await app.inject(`/trpc/layout.get?input=${encodeURIComponent(JSON.stringify({ zone: 'unregistered' }))}`))
      .statusCode,
    400,
  );
});
