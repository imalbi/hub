import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { jobProcedure, protectedProcedure, router } from './core/trpc.ts';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';
import { emptyConfig } from './core/config.ts';
import { coreConfigSchema } from './core/config-schema.ts';

process.env.NODE_ENV = 'test';

void test('MCP accepts absent or allowed origins and rejects foreign origins', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const request = (origin?: string) =>
    app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { accept: 'application/json, text/event-stream', ...(origin && { origin }) },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      },
    });
  assert.equal((await request()).statusCode, 200);
  assert.equal((await request('https://foreign.example')).statusCode, 403);
  assert.equal((await request('http://127.0.0.1:4180')).statusCode, 200);
});

void test('SDK client sees the registry tools and can call a safe action', async (t) => {
  let called = 0;
  let emit: ((text: string, stream: 'stdout' | 'stderr') => void) | undefined;
  const app = buildServer({
    dbPath: ':memory:',
    deps: {
      run: createFakeDesktop(),
      spawn: (_bin, _args, line) => {
        emit = line;
        return { kill() {} };
      },
      testRouters: {
        demo: router({
          echo: protectedProcedure
            .meta({ label: 'Eco', description: 'Echo a number' })
            .input(z.object({ value: z.number() }))
            .mutation(({ input }) => {
              called++;
              return input;
            }),
          opaque: protectedProcedure
            .meta({ label: 'Opaco', description: 'An opaque input' })
            .input(z.custom<string>())
            .mutation(() => null),
          combined: protectedProcedure
            .meta({ label: 'Composto', description: 'Combined input schemas' })
            .input(z.object({ first: z.string() }))
            .input(z.object({ second: z.number() }))
            .mutation(() => null),
          job: jobProcedure
            .meta({ label: 'Job di prova', description: 'Start a fake job', job: true })
            .mutation(({ ctx }) => ctx.startJob('fake-job', [])),
        }),
      },
    },
  });
  t.after(() => app.close());
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
  const registry = (await app.inject('/trpc/registry.list')).json().result.data;
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === 'demo.echo'));
  assert.deepEqual(
    tools.map((tool) => tool.name).toSorted(),
    registry.map((action: { path: string }) => action.path).toSorted(),
  );
  for (const tool of tools) {
    const action = registry.find((item: { path: string }) => item.path === tool.name);
    assert.deepEqual(tool.inputSchema, action.schema ?? { type: 'object' });
  }
  const resources = await client.listResources();
  assert.ok(resources.resources.some(({ uri }) => uri === 'hub://audio'));
  assert.ok(resources.resources.some(({ uri }) => uri === 'hub://system/power'));
  for (const resource of resources.resources) {
    const name = resource.uri.slice('hub://'.length);
    const query = name.includes('/') ? name.replace('/', '.') : `${name}.state`;
    const value = await client.readResource({ uri: resource.uri });
    const expected = (await app.inject(`/trpc/${query}`)).json().result.data;
    const content = value.contents[0];
    assert.ok(content && 'text' in content);
    const actual = JSON.parse(content.text);
    if (name === 'pomodoro') {
      assert.ok(Math.abs(actual.serverNow - expected.serverNow) < 1000);
      actual.serverNow = expected.serverNow;
    }
    assert.deepEqual(actual, expected, resource.uri);
  }
  const result = await client.callTool({ name: 'media.playPause', arguments: {} });
  assert.notEqual(result.isError, true);
  const invalid = await client.callTool({ name: 'demo.echo', arguments: { value: 'wrong' } });
  assert.equal(invalid.isError, true);
  assert.equal(called, 0);
  const valid = await client.callTool({ name: 'demo.echo', arguments: { value: 5 } });
  assert.deepEqual(JSON.parse(z.array(z.object({ text: z.string() })).parse(valid.content)[0]?.text ?? 'null'), {
    value: 5,
  });
  assert.equal(called, 1);
  const job = await client.callTool({ name: 'demo.job' });
  const { jobId } = z
    .object({ jobId: z.string() })
    .parse(JSON.parse(z.array(z.object({ text: z.string() })).parse(job.content)[0]?.text ?? 'null'));
  for (let index = 0; index < 501; index++) emit?.(`line ${index}`, 'stdout');
  const output = await client.callTool({ name: 'jobs.output', arguments: { jobId } });
  const lines = z
    .array(z.object({ message: z.string() }))
    .parse(JSON.parse(z.array(z.object({ text: z.string() })).parse(output.content)[0]?.text ?? 'null'));
  assert.equal(lines.length, 500);
  assert.equal(lines[0]?.message, 'line 1');
  const danger = await client.callTool({ name: 'jobs.cancel', arguments: { jobId: 'example', confirmed: true } });
  assert.equal(danger.isError, true);
  assert.match(JSON.stringify(danger.content), /no.*client|no.*desk/i);
});

void test('agent tokens admit LAN requests until revoked', async (t) => {
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    isLoopback: (peer) => peer.headers['x-test-remote'] !== 'yes',
  });
  t.after(() => app.close());
  const created = await app.inject({ method: 'POST', url: '/trpc/agents.create', payload: { name: 'Test agent' } });
  assert.equal(created.statusCode, 200);
  const { id, token } = created.json().result.data;
  const request = (bearer?: string) =>
    app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'x-test-remote': 'yes',
        accept: 'application/json, text/event-stream',
        ...(bearer && { authorization: `Bearer ${bearer}` }),
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      },
    });
  assert.equal((await request()).statusCode, 401);
  assert.equal((await request(token)).statusCode, 200);
  const action = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'x-test-remote': 'yes',
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
    },
    payload: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'media.playPause', arguments: {} } },
  });
  assert.equal(action.statusCode, 200);
  const calls = await app.inject(`/trpc/agents.calls?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  assert.equal(calls.json().result.data[0].action, 'media.playPause');
  const revoke = await app.inject({ method: 'POST', url: '/trpc/agents.revoke', payload: { id, confirmed: true } });
  assert.equal(revoke.statusCode, 200);
  assert.equal((await request(token)).statusCode, 401);
});

void test('MCP discovers settings and edits only permitted core and module fields', { timeout: 5000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-mcp-settings-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'modules');
  await mkdir(join(root, 'vault'), { recursive: true });
  await writeFile(
    join(root, 'vault', 'server.ts'),
    `import { defineModule, z } from ${JSON.stringify(new URL('./core/module.ts', import.meta.url).href)};
     export default defineModule({ name: 'vault', config: z.object({
       label: z.string(), secret: z.string().meta({ secret: true }), command: z.string().meta({ manual: true })
     }), create: () => ({}) });`,
  );
  const initial = {
    server: { host: '127.0.0.1', allowedOrigins: ['https://example.test'], deviceTokenTtlDays: 30 },
    backup: { dir: '/tmp/hub-backups', keep: 14 },
    assistant: { model: 'chat-test', decisionModel: 'decision-test' },
    modulesOff: ['vault'],
    modules: { vault: { label: 'Before', secret: 'fixture-private-value', command: '/usr/bin/fixture' } },
  };
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify(initial));
  let restarts = 0;
  let resolveRestart = () => {};
  const restarted = new Promise<void>((resolve) => {
    resolveRestart = resolve;
  });
  const app = buildServer({
    dbPath: ':memory:',
    config: { ...emptyConfig, modulesOff: ['vault'], modules: initial.modules },
    moduleRoots: [root],
    deps: { run: createFakeDesktop() },
    settings: {
      configPath,
      onRestart: () => {
        if (++restarts === 2) resolveRestart();
      },
    },
  });
  t.after(() => app.close());
  const request = async (method: string, params?: unknown) => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 1, method, params },
    });
    assert.equal(response.statusCode, 200);
    return z.object({ result: z.unknown() }).parse(response.json()).result;
  };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = z
      .object({ isError: z.boolean().optional(), content: z.array(z.object({ text: z.string() })).min(1) })
      .parse(await request('tools/call', { name, arguments: args }));
    const value: unknown = JSON.parse(result.content[0]?.text ?? 'null');
    return { isError: result.isError === true, value };
  };
  const { tools } = z.object({ tools: z.array(z.object({ name: z.string() })) }).parse(await request('tools/list'));
  for (const name of ['settings.modules', 'settings.core', 'settings.saveCore', 'settings.save'])
    assert.ok(
      tools.some((tool) => tool.name === name),
      name,
    );
  const modules = await call('settings.modules');
  assert.equal(modules.isError, false);
  assert.ok(
    z
      .array(z.object({ name: z.string(), status: z.string(), hasConfig: z.boolean() }))
      .parse(modules.value)
      .some((entry) => entry.name === 'vault' && entry.status === 'off' && entry.hasConfig),
  );
  const core = await call('settings.core');
  assert.equal(core.isError, false);
  const coreResult = z
    .object({
      schema: z.object({ properties: z.record(z.string(), z.unknown()) }),
      value: z.record(z.string(), z.unknown()),
    })
    .parse(core.value);
  assert.equal('server' in coreResult.schema.properties, false);
  assert.equal('server' in coreResult.value, false);
  assert.equal(coreConfigSchema.parse(coreResult.value).assistant.decisionModel, 'decision-test');
  const moduleConfig = await call('settings.config', { module: 'vault' });
  assert.equal(moduleConfig.isError, false);
  assert.ok(!JSON.stringify(moduleConfig.value).includes(initial.modules.vault.secret));
  const savedCore = await call('settings.saveCore', {
    jobs: { maxConcurrent: 4 },
    backup: { keep: 21 },
    assistant: { model: 'new-chat' },
    server: { host: '0.0.0.0' },
    modulesOff: [],
  });
  assert.equal(savedCore.isError, false);
  assert.deepEqual(savedCore.value, { ok: true, restarting: true });
  assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), {
    ...initial,
    jobs: { maxConcurrent: 4 },
    backup: { ...initial.backup, keep: 21 },
    assistant: { ...initial.assistant, model: 'new-chat' },
  });
  const kept = { ...initial.modules.vault, label: 'After', secret: { set: true } };
  assert.equal((await call('settings.save', { module: 'vault', value: kept })).isError, false);
  const after = JSON.parse(await readFile(configPath, 'utf8'));
  assert.deepEqual(after.modules.vault, { ...initial.modules.vault, label: 'After' });
  assert.deepEqual(after.modulesOff, ['vault']);
  for (const [name, args] of [
    ['settings.saveCore', { backup: { dir: '/tmp/other' } }],
    ['settings.saveCore', { mcp: { enabled: false } }],
    ['settings.save', { module: 'vault', value: { ...kept, secret: 'replacement' } }],
    ['settings.save', { module: 'vault', value: { ...kept, command: '/usr/bin/other' } }],
  ] as const) {
    const before = await readFile(configPath, 'utf8');
    const backup = await readFile(`${configPath}.bak`, 'utf8');
    const refused = await call(name, args);
    assert.equal(refused.isError, true);
    assert.match(JSON.stringify(refused.value), /manual change/);
    assert.equal(await readFile(configPath, 'utf8'), before);
    assert.equal(await readFile(`${configPath}.bak`, 'utf8'), backup);
  }
  await restarted;
  assert.equal(restarts, 2);
});
