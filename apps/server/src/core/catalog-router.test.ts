import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { openDb } from '../db/index.ts';
import { buildServer } from '../server.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { createDeviceSockets } from './auth.ts';
import { createCatalogRouter } from './catalog-router.ts';
import { createCatalogService } from './catalog.ts';
import { emptyConfig } from './config.ts';
import type { Run } from './exec.ts';
import { createFiles } from './files.ts';
import { createJobRunner } from './jobs.ts';

process.env.NODE_ENV = 'test';

const LAN = '192.0.2.20';

async function scratch(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-catalog-router-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function fakeGitRun(): Run {
  return async (bin, args) => {
    if (bin !== 'git') return { stdout: '', stderr: 'not git', code: 1 };
    if (args.includes('clone')) {
      const target = args.at(-1) ?? '';
      await mkdir(join(target, 'modules', 'demo'), { recursive: true });
      await writeFile(
        join(target, 'hub-catalog.json'),
        JSON.stringify({
          version: 1,
          name: 'Catalog Demo',
          description: 'Demo catalog',
          modules: [
            { name: 'demo', title: 'Demo', description: 'Demo module', version: '1.0.0', path: 'modules/demo' },
          ],
        }),
      );
      await writeFile(join(target, 'modules', 'demo', 'server.ts'), 'export default {};\n');
      return { stdout: '', stderr: '', code: 0 };
    }
    if (args.includes('rev-parse'))
      return { stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', stderr: '', code: 0 };
    return { stdout: '', stderr: '', code: 0 };
  };
}

void test('catalog endpoints reject anonymous, paired devices, and agents, and stay hidden from registry and MCP', async (t) => {
  const dir = await scratch(t);
  const app = buildServer({
    dbPath: join(dir, 'hub.db'),
    deps: { run: fakeGitRun() },
    config: emptyConfig,
    catalog: {
      reposDir: join(dir, 'repos'),
      installedDir: join(dir, 'installed'),
      localDir: join(dir, 'local'),
    },
  });
  t.after(() => app.close());

  // Pair a phone over LAN.
  const created = z.object({ code: z.string() }).parse(
    (
      await app.inject({
        method: 'POST',
        url: '/trpc/pairing.createCode',
        headers: { 'content-type': 'application/json' },
        payload: {},
      })
    ).json().result.data,
  );
  const redeemed = await app.inject({
    method: 'POST',
    url: '/trpc/pairing.redeem',
    remoteAddress: LAN,
    headers: { 'content-type': 'application/json' },
    payload: { code: created.code, deviceName: 'Phone' },
  });
  const token = z.object({ token: z.string() }).parse(redeemed.json().result.data).token;

  const queries: [string, unknown][] = [['catalog.state', undefined]];
  const mutations: [string, unknown][] = [
    ['catalog.addSource', { url: 'https://example.com/org/repo.git' }],
    ['catalog.syncSource', { id: 'repo' }],
    ['catalog.removeSource', { id: 'repo', confirmed: true }],
    ['catalog.install', { sourceId: 'repo', name: 'demo', confirmed: true }],
    ['catalog.update', { name: 'demo', confirmed: true }],
    ['catalog.remove', { name: 'demo', confirmed: true }],
    ['catalog.applyChanges', undefined],
  ];

  for (const [path, input] of queries) {
    assert.equal((await app.inject({ method: 'GET', url: `/trpc/${path}`, remoteAddress: LAN })).statusCode, 401, path);
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: `/trpc/${path}`,
          remoteAddress: LAN,
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
      403,
      path,
    );
    void input;
  }

  for (const [path, input] of mutations) {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/trpc/${path}`,
          remoteAddress: LAN,
          headers: { 'content-type': 'application/json' },
          payload: input ?? {},
        })
      ).statusCode,
      401,
      path,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/trpc/${path}`,
          remoteAddress: LAN,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          payload: input ?? {},
        })
      ).statusCode,
      403,
      path,
    );
  }

  // Registry and MCP never expose catalog tools or resources.
  const registry = z
    .array(z.object({ path: z.string() }))
    .parse((await app.inject('/trpc/registry.list')).json().result.data);
  assert.equal(
    registry.some((action) => action.path.startsWith('catalog.')),
    false,
  );

  const client = new Client({ name: 'test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: async (_input, init) => {
      const headers = Object.fromEntries(new Headers(init?.headers));
      const result = await app.inject({
        method: init?.method === 'POST' ? 'POST' : 'GET',
        url: '/mcp',
        headers,
        payload: typeof init?.body === 'string' ? init.body : undefined,
      });
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(result.headers))
        if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
      return new Response(result.body || null, { status: result.statusCode, headers: responseHeaders });
    },
  });
  await client.connect(transport);
  t.after(() => client.close());

  const { tools } = await client.listTools();
  assert.equal(
    tools.some((tool) => tool.name.startsWith('catalog.')),
    false,
  );
  const { resources } = await client.listResources();
  assert.equal(
    resources.some((resource) => resource.uri.startsWith('hub://catalog')),
    false,
  );

  for (const toolName of ['catalog.addSource', 'catalog.install', 'catalog.applyChanges']) {
    const call = await client.callTool({ name: toolName, arguments: {} });
    assert.equal(call.isError, true, toolName);
  }

  // Direct router caller with an agent client also rejects every procedure with FORBIDDEN.
  const memDb = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(memDb, () => ({ kill() {} }), 1);
  const directCatalog = createCatalogService({
    db: memDb,
    run: fakeGitRun(),
    jobs,
    reposDir: join(dir, 'd-repos'),
    installedDir: join(dir, 'd-installed'),
    localDir: join(dir, 'd-local'),
  });
  t.after(async () => {
    directCatalog.close();
    jobs.close();
    await files.close();
    memDb.$client.close();
  });
  const agentCaller = createCatalogRouter(directCatalog).createCaller({
    db: memDb,
    run: createFakeDesktop(),
    jobs,
    config: emptyConfig,
    files,
    client: { kind: 'agent', agentId: 1, name: 'Agent' },
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  });
  await assert.rejects(() => agentCaller.state(), /Only the PC/);
  await assert.rejects(() => agentCaller.addSource({ url: 'https://example.com/org/r.git' }), /Only the PC/);
  await assert.rejects(() => agentCaller.applyChanges(), /Only the PC/);
});

void test('catalog.applyChanges serializes build jobs, clears pendingApply + restarts only on exit 0, and preserves pendingApply across restarts', async (t) => {
  const dir = await scratch(t);
  const dbPath = join(dir, 'hub.db');
  const processes: { end: (code: number | null) => void }[] = [];
  let restarts = 0;

  const opts = {
    dbPath,
    deps: {
      run: fakeGitRun(),
      spawn: (
        _bin: string,
        _args: string[],
        _line: (t: string, s: 'stdout' | 'stderr') => void,
        end: (c: number | null) => void,
      ) => {
        const proc = { end };
        processes.push(proc);
        return {
          kill() {
            end(null);
          },
        };
      },
    },
    catalog: {
      reposDir: join(dir, 'repos'),
      installedDir: join(dir, 'installed'),
      localDir: join(dir, 'local'),
      buildCommand: { bin: 'fake-build', args: [] },
      onRestart: () => {
        restarts++;
      },
    },
  };

  const app = buildServer(opts);

  const post = (path: string, payload: object = {}) =>
    app.inject({
      method: 'POST',
      url: `/trpc/${path}`,
      headers: { 'content-type': 'application/json' },
      payload,
    });

  const added = await post('catalog.addSource', { url: 'https://example.com/org/repo.git' });
  assert.equal(added.statusCode, 200);
  const sourceId = z.object({ id: z.string() }).parse(added.json().result.data).id;

  const installed = await post('catalog.install', { sourceId, name: 'demo', confirmed: true });
  assert.equal(installed.statusCode, 200);
  assert.equal((await app.inject('/trpc/catalog.state')).json().result.data.pendingApply, true);

  // First apply starts the build job; a second concurrent apply or module mutation returns 409 CONFLICT.
  const firstApply = await post('catalog.applyChanges');
  assert.equal(firstApply.statusCode, 200);
  assert.equal(firstApply.json().result.data.restarting, true);
  assert.equal((await post('catalog.applyChanges')).statusCode, 409);
  assert.equal((await post('catalog.remove', { name: 'demo', confirmed: true })).statusCode, 409);

  // Failing build keeps pendingApply: true and does NOT restart.
  processes[0]?.end(1);
  await sleep(30);
  const afterFail = (await app.inject('/trpc/catalog.state')).json().result.data;
  assert.equal(afterFail.pendingApply, true);
  assert.equal(afterFail.buildJob?.status, 'failed');
  assert.equal(restarts, 0);

  // Successful build clears pendingApply and triggers onRestart.
  const secondApply = await post('catalog.applyChanges');
  assert.equal(secondApply.statusCode, 200);
  processes[1]?.end(0);
  await sleep(30);
  const afterSuccess = (await app.inject('/trpc/catalog.state')).json().result.data;
  assert.equal(afterSuccess.pendingApply, false);
  assert.equal(afterSuccess.buildJob?.status, 'completed');
  assert.equal(restarts, 1);

  // Pending state persists across server restarts when a change hasn't been applied yet.
  await post('catalog.remove', { name: 'demo', confirmed: true });
  assert.equal((await app.inject('/trpc/catalog.state')).json().result.data.pendingApply, true);
  await app.close();

  const reopened = buildServer(opts);
  t.after(() => reopened.close());
  assert.equal((await reopened.inject('/trpc/catalog.state')).json().result.data.pendingApply, true);
});

void test('catalog apply waits for earlier catalog mutations before building', async (t) => {
  const dir = await scratch(t);
  const db = openDb(':memory:');
  let signalHead = () => {};
  let resumeHead = () => {};
  const headStarted = new Promise<void>((resolve) => {
    signalHead = resolve;
  });
  const headResumed = new Promise<void>((resolve) => {
    resumeHead = resolve;
  });
  const fakeGit = fakeGitRun();
  const run: Run = async (bin, args, options) => {
    if (args.includes('rev-parse')) {
      signalHead();
      await headResumed;
    }
    return fakeGit(bin, args, options);
  };
  let buildIncludedModule = false;
  const jobs = createJobRunner(
    db,
    () => {
      buildIncludedModule = existsSync(join(dir, 'installed', 'demo', 'server.ts'));
      return { kill() {} };
    },
    1,
  );
  const catalog = createCatalogService({
    db,
    run,
    jobs,
    reposDir: join(dir, 'repos'),
    installedDir: join(dir, 'installed'),
    localDir: join(dir, 'local'),
  });
  t.after(() => {
    catalog.close();
    jobs.close();
    db.$client.close();
  });
  const adding = catalog.addSource({ url: 'https://example.com/org/repo.git' });
  await headStarted;
  const installing = catalog.installModule({ sourceId: 'repo', name: 'demo' });
  const applying = catalog.apply();
  resumeHead();
  await adding;
  const installation = await Promise.allSettled([installing, applying]);
  assert.equal(buildIncludedModule, true, 'build must include the earlier installation');
  assert.deepEqual(
    installation.map((result) => result.status),
    ['fulfilled', 'fulfilled'],
  );
});
