import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Config } from './config.ts';
import { createFakeDesktop } from './fake-desktop.ts';
import { buildServer } from './server.ts';

process.env.NODE_ENV = 'test';

const config: Config = {
  audio: {
    outputs: [
      { label: 'Cuffie', match: 'USB Headset' },
      { label: 'Monitor', match: 'HDMI Monitor' },
    ],
  },
  server: { host: '127.0.0.1', allowedOrigins: [] },
};

const app = buildServer({ dbPath: ':memory:', run: createFakeDesktop(), config });
let port = 0;

before(async () => {
  port = Number(new URL(await app.listen({ host: '127.0.0.1', port: 0 })).port);
});
after(() => app.close());

/** A tRPC WebSocket client with the dev origin the server expects; `next` resolves with the next message or fails. */
function connect() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/trpc`, { headers: { Origin: 'http://127.0.0.1:5173' } });
  const queue: unknown[] = [];
  const waiting: Array<(message: unknown) => void> = [];
  ws.addEventListener('message', (event) => {
    const message: unknown = JSON.parse(String(event.data));
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')));
  });

  function next(ms = 500) {
    if (queue.length > 0) return Promise.resolve(queue.shift());
    return new Promise<unknown>((resolve, reject) => {
      waiting.push(resolve);
      setTimeout(() => reject(new Error(`no message within ${ms}ms`)), ms).unref();
    });
  }
  async function subscribe(path: string) {
    await opened;
    ws.send(JSON.stringify({ id: 1, method: 'subscription', params: { path } }));
  }
  return { subscribe, next, close: () => ws.close() };
}

const data = (value: unknown) => ({ id: 1, result: { type: 'data', data: value } });
const started = { id: 1, result: { type: 'started' } };

void test('media.onState pushes the current state, then the new one right after play/pause', async () => {
  const client = connect();
  await client.subscribe('media.onState');
  assert.deepEqual(await client.next(), started);
  assert.deepEqual(await client.next(), data({ status: 'Playing', artist: 'Artist', title: 'Title' }));

  // The poll interval is 1 s and `next` gives up after 0.5 s: only the refresh after the mutation can win.
  const res = await app.inject({
    method: 'POST',
    url: '/trpc/media.playPause',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(await client.next(), data({ status: 'Paused', artist: 'Artist', title: 'Title' }));
  client.close();
});

void test('audio.onState pushes the current state, then the new one right after cycleOutput', async () => {
  const client = connect();
  await client.subscribe('audio.onState');
  assert.deepEqual(await client.next(), started);
  assert.deepEqual(
    await client.next(),
    data({
      current: { label: 'Cuffie' },
      outputs: [
        { label: 'Cuffie', available: true },
        { label: 'Monitor', available: true },
      ],
    }),
  );

  const res = await app.inject({
    method: 'POST',
    url: '/trpc/audio.cycleOutput',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    await client.next(),
    data({
      current: { label: 'Monitor' },
      outputs: [
        { label: 'Cuffie', available: true },
        { label: 'Monitor', available: true },
      ],
    }),
  );
  client.close();
});
