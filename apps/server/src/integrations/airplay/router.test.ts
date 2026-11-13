import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyConfig } from '../../core/config.ts';
import type { Run } from '../../core/exec.ts';
import { buildServer } from '../../server.ts';
import { airplayConfigSchema } from './module.ts';

process.env.NODE_ENV = 'test';

function fakeRun(options: { statusCode?: number; startCode?: number; stopCode?: number } = {}) {
  const calls: Array<[string, string[]]> = [];
  let isRunning = options.statusCode === 0;
  const run: Run = (bin, args) => {
    calls.push([bin, args]);
    if (bin === 'fake-airplay') {
      const [action] = args;
      if (action === 'status') {
        const code = options.statusCode !== undefined ? options.statusCode : isRunning ? 0 : 1;
        return Promise.resolve({ stdout: code === 0 ? 'RUNNING' : 'STOPPED', stderr: '', code });
      }
      if (action === 'start') {
        const code = options.startCode ?? 0;
        if (code === 0) isRunning = true;
        return Promise.resolve({ stdout: '', stderr: '', code });
      }
      if (action === 'stop') {
        const code = options.stopCode ?? 0;
        if (code === 0) isRunning = false;
        return Promise.resolve({ stdout: '', stderr: '', code });
      }
    }
    return Promise.resolve({ stdout: '', stderr: '', code: 0 });
  };
  return { run, calls };
}

const post = (app: Pick<Awaited<ReturnType<typeof buildServer>>, 'inject'>, path: string) =>
  app.inject({
    method: 'POST',
    url: `/trpc/airplay.${path}`,
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });

/** Wires the integration like the private module's server.ts does, from a temporary module root. */
async function setup(t: test.TestContext, run: Run, modules: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), 'hub-airplay-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'airplay'));
  const api = new URL('../../core/module.ts', import.meta.url).href;
  const airplay = new URL('./module.ts', import.meta.url).href;
  await writeFile(
    join(root, 'airplay', 'server.ts'),
    `import { defineModule } from ${JSON.stringify(api)}; import { airplayConfigSchema, createConfiguredAirPlay } from ${JSON.stringify(airplay)}; export default defineModule({ name: 'airplay', config: airplayConfigSchema, create: ({ config, run }) => createConfiguredAirPlay({ config, run }) });`,
  );
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run },
    moduleRoots: [root],
    config: { ...emptyConfig, modules },
  });
  t.after(() => app.close());
  await app.ready();
  return app;
}

const configured = { airplay: { command: 'fake-airplay' } };

void test('without modules.airplay the module does not load: no route, no action, not in the enabled list', async (t) => {
  const { run, calls } = fakeRun();
  const app = await setup(t, run, {});

  assert.equal((await app.inject({ method: 'GET', url: '/trpc/airplay.state' })).statusCode, 404);
  assert.equal((await post(app, 'start')).statusCode, 404);
  const actions = (await app.inject({ method: 'GET', url: '/trpc/registry.list' })).json().result.data;
  assert.deepEqual(
    actions.filter((action: { path: string }) => action.path.startsWith('airplay.')),
    [],
  );
  const enabled = (await app.inject({ method: 'GET', url: '/trpc/modules.enabled' })).json().result.data;
  assert.ok(!enabled.includes('airplay'));
  assert.equal(calls.length, 0);
});

void test('a missing or empty command is refused', () => {
  assert.equal(airplayConfigSchema.safeParse({}).success, false);
  assert.equal(airplayConfigSchema.safeParse({ command: '' }).success, false);
  assert.equal(airplayConfigSchema.safeParse({ command: 'airplay' }).success, true);
});

void test('airplay.state reports running status from exit code of airplay status', async (t) => {
  const stopped = fakeRun({ statusCode: 1 });
  const appStopped = await setup(t, stopped.run, configured);
  const resStopped = await appStopped.inject({ method: 'GET', url: '/trpc/airplay.state' });
  assert.deepEqual(resStopped.json().result.data, { running: false });
  assert.deepEqual(stopped.calls.at(-1), ['fake-airplay', ['status']]);

  const running = fakeRun({ statusCode: 0 });
  const appRunning = await setup(t, running.run, configured);
  const resRunning = await appRunning.inject({ method: 'GET', url: '/trpc/airplay.state' });
  assert.deepEqual(resRunning.json().result.data, { running: true });
  assert.deepEqual(running.calls.at(-1), ['fake-airplay', ['status']]);
});

void test('airplay.start and airplay.stop invoke the command and handle errors', async (t) => {
  const { run, calls } = fakeRun();
  const app = await setup(t, run, configured);

  assert.equal((await post(app, 'start')).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['fake-airplay', ['start']]);
  assert.equal((await post(app, 'stop')).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['fake-airplay', ['stop']]);

  const failing = await setup(t, fakeRun({ startCode: 1, stopCode: 1 }).run, configured);
  assert.equal((await post(failing, 'start')).statusCode, 500);
  assert.equal((await post(failing, 'stop')).statusCode, 500);
});
