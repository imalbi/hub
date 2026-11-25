import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import fastify from 'fastify';
import { emptyConfig } from './core/config.ts';
import { registerFiles } from './core/file-routes.ts';
import { createFiles } from './core/files.ts';
import { allowedOrigins } from './core/origin.ts';
import { publicProcedure, router } from './core/trpc.ts';
import { openDb } from './db/index.ts';
import { buildServer, serializeRequest } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

function multipartPayload(body: string) {
  return `--hub\r\nContent-Disposition: form-data; name="file"; filename="x.json"\r\nContent-Type: application/json\r\n\r\n${body}\r\n--hub--\r\n`;
}

void test('cross-site multipart and non-JSON POSTs to /trpc are refused without side effects', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-csrf-'));
  const configPath = join(dir, 'config.json');
  const initialConfig = '{\n  "mcp": { "enabled": true }\n}\n';
  await writeFile(configPath, initialConfig);

  let runs = 0;
  let restarts = 0;
  const desktop = createFakeDesktop();
  const app = buildServer({
    dbPath: ':memory:',
    deps: {
      run: async (bin, args, options) => {
        runs++;
        return desktop(bin, args, options);
      },
    },
    settings: {
      configPath,
      onRestart: () => {
        restarts++;
      },
    },
  });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  const payload = multipartPayload(JSON.stringify({ mcp: { enabled: false } }));
  for (const path of ['/trpc/system.lock', '/trpc/settings.saveCore']) {
    const foreignOrigin = await app.inject({
      method: 'POST',
      url: path,
      headers: {
        origin: 'https://evil.example',
        'content-type': 'multipart/form-data; boundary=hub',
      },
      payload,
    });
    assert.equal(foreignOrigin.statusCode, 403, path);

    const noOriginMultipart = await app.inject({
      method: 'POST',
      url: path,
      headers: { 'content-type': 'multipart/form-data; boundary=hub' },
      payload,
    });
    assert.equal(noOriginMultipart.statusCode, 415, path);

    const plainText = await app.inject({
      method: 'POST',
      url: path,
      headers: { 'content-type': 'text/plain' },
      payload: '{}',
    });
    assert.equal(plainText.statusCode, 415, path);
  }
  assert.equal(runs, 0);
  assert.equal(restarts, 0);
  assert.equal(await readFile(configPath, 'utf8'), initialConfig);

  const foreignJson = await app.inject({
    method: 'POST',
    url: '/trpc/system.lock',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(foreignJson.statusCode, 403);
  assert.equal(runs, 0);

  for (const origin of ['http://127.0.0.1:4180', 'http://localhost:4180']) {
    const ok = await app.inject({
      method: 'POST',
      url: '/trpc/system.lock',
      headers: { origin, 'content-type': 'application/json; charset=utf-8' },
      payload: '{}',
    });
    assert.equal(ok.statusCode, 200, origin);
  }
  assert.equal(runs, 2);
});

void test('foreign, missing or malformed Host headers are refused across all routes', async (t) => {
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    config: {
      ...emptyConfig,
      server: { deviceTokenTtlDays: 90, host: '127.0.0.1', allowedOrigins: ['http://hub.example:4180'] },
    },
  });
  const port = Number(new URL(await app.listen({ host: '127.0.0.1', port: 0 })).port);
  t.after(() => app.close());

  for (const req of [
    { method: 'GET' as const, url: '/trpc/devices.list' },
    {
      method: 'POST' as const,
      url: '/trpc/agents.create',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    },
    { method: 'POST' as const, url: '/mcp', headers: { 'content-type': 'application/json' }, payload: '{}' },
    { method: 'GET' as const, url: '/files/x' },
    { method: 'GET' as const, url: '/m/missing/cover/x' },
  ]) {
    const res = await app.inject({
      ...req,
      headers: { ...req.headers, host: 'rebind.example:4180' },
    });
    assert.equal(res.statusCode, 421, `${req.method} ${req.url}`);
  }

  for (const host of ['evil@localhost:4180', 'localhost:4180, evil.example', '0x7f000001:4180']) {
    const res = await app.inject({ method: 'GET', url: '/trpc/devices.list', headers: { host } });
    assert.equal(res.statusCode, 421, host);
  }

  // Raw HTTP/1.0 requests test missing and empty Host headers (inject always replaces falsy Host with localhost:80).
  const sendRaw = (payloadText: string) =>
    new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write(payloadText);
      });
      let chunks = '';
      socket.on('data', (chunk) => {
        chunks += chunk.toString('utf8');
      });
      socket.on('end', () => resolve(chunks.split('\r\n')[0] ?? ''));
      socket.on('error', reject);
    });
  for (const rawReq of ['GET /trpc/health HTTP/1.0\r\n\r\n', 'GET /trpc/health HTTP/1.0\r\nHost: \r\n\r\n']) {
    assert.match(await sendRaw(rawReq), /^HTTP\/1\.1 421 /);
  }

  for (const host of ['127.0.0.1:4180', 'localhost:4180', '[::1]:4180', 'hub.example:4180']) {
    const res = await app.inject({ method: 'GET', url: '/trpc/devices.list', headers: { host } });
    assert.equal(res.statusCode, 200, host);
  }
});

void test('unauthenticated multipart body is rejected early and oversized WebSocket frames close with 1009', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  const port = Number(new URL(await app.listen({ host: '127.0.0.1', port: 0 })).port);
  t.after(() => app.close());

  const big = multipartPayload('x'.repeat(2 * 1024 * 1024));
  const started = performance.now();
  const res = await app.inject({
    method: 'POST',
    url: '/trpc/pairing.redeem',
    remoteAddress: '192.0.2.20',
    headers: { 'content-type': 'multipart/form-data; boundary=hub' },
    payload: big,
  });
  assert.ok(performance.now() - started < 200);
  assert.equal(res.statusCode, 415);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/trpc`, { headers: { Origin: 'http://127.0.0.1:4180' } });
  const closeCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WS close')), 2000);
    ws.addEventListener('open', () => {
      ws.send('x'.repeat(1024 * 1024 + 64));
    });
    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      resolve(event.code);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket error'));
    });
  });
  assert.equal(closeCode, 1009);
});

void test('request log serializer strips query strings from URLs', () => {
  const serialized = serializeRequest({
    method: 'GET',
    url: '/trpc/mail.list?input=%7B%22q%22%3A%22secret%22%7D',
    host: '127.0.0.1:4180',
    ip: '127.0.0.1',
  });
  assert.equal(serialized.url, '/trpc/mail.list');
  assert.equal(JSON.stringify(serialized).includes('secret'), false);
  assert.equal(JSON.stringify(serialized).includes('?'), false);
});

void test('internal tRPC and /files errors do not leak OS paths or filesystem details', async (t) => {
  const app = buildServer({
    dbPath: ':memory:',
    deps: {
      run: createFakeDesktop(),
      testRouters: {
        boom: router({
          fail: publicProcedure.query(() => {
            throw new Error('ENOENT: /secret/local/path');
          }),
        }),
      },
    },
  });
  t.after(() => app.close());

  const trpcFail = await app.inject({ method: 'GET', url: '/trpc/boom.fail' });
  assert.equal(trpcFail.statusCode, 500);
  assert.equal(trpcFail.json().error.message, 'Internal server error');
  assert.equal(trpcFail.body.includes('/secret/local/path'), false);
  assert.equal(trpcFail.body.includes('ENOENT'), false);

  const db = openDb(':memory:');
  const files = createFiles({ maxEntries: 1 });
  const fileApp = fastify({ logger: false });
  fileApp.register(async (scope) =>
    registerFiles(scope, {
      db,
      files,
      isLoopback: () => true,
      maxUploadMb: 5,
      origins: allowedOrigins(emptyConfig),
    }),
  );
  t.after(async () => {
    await fileApp.close();
    await files.close();
    db.$client.close();
  });

  const boundary = 'hub-test';
  const uploadReq = (content: string) => ({
    method: 'POST' as const,
    url: '/files',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  });
  const first = await fileApp.inject(uploadReq('first'));
  assert.equal(first.statusCode, 200);
  const { fileId } = first.json();
  const second = await fileApp.inject(uploadReq('second'));
  assert.equal(second.statusCode, 413);

  const stored = await files.get(fileId);
  await rm(stored.path);
  const missingOnDisk = await fileApp.inject({ method: 'GET', url: `/files/${fileId}` });
  assert.equal(missingOnDisk.statusCode, 500);
  assert.deepEqual(missingOnDisk.json(), { error: 'Internal server error' });
  assert.equal(missingOnDisk.body.includes(stored.path), false);
});
