import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { jobProcedure, protectedProcedure, router } from './core/trpc.ts';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

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
