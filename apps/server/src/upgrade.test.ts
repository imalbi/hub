import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { after, before, test } from 'node:test';
import { emptyConfig } from './config.ts';
import { buildServer } from './server.ts';

process.env.NODE_ENV = 'test';

const app = buildServer({
  dbPath: ':memory:',
  config: { ...emptyConfig, server: { allowedOrigins: ['https://hub.example'] } },
});
let port = 0;

before(async () => {
  port = Number(new URL(await app.listen({ host: '127.0.0.1', port: 0 })).port);
});
after(() => app.close());

/** Sends a raw WebSocket upgrade to /trpc and resolves with the HTTP status: 101 when the server accepts. */
function upgrade(origin?: string) {
  return new Promise<number>((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/trpc',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        ...(origin && { Origin: origin }),
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

void test('a WebSocket upgrade from a foreign origin is refused with 403', async () => {
  assert.equal(await upgrade('https://evil.example'), 403);
});

void test('a WebSocket upgrade without an Origin header is refused with 403', async () => {
  assert.equal(await upgrade(), 403);
});

void test('a WebSocket upgrade from a dev origin is accepted', async () => {
  assert.equal(await upgrade('http://127.0.0.1:5173'), 101);
});

void test('a WebSocket upgrade from an origin in the config is accepted', async () => {
  assert.equal(await upgrade('https://hub.example'), 101);
});
