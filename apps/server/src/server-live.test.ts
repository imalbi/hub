import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { emptyConfig, type Config } from './core/config.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';
import { buildServer } from './server.ts';

process.env.NODE_ENV = 'test';

const config: Config = {
  ...emptyConfig,
  system: {
    monitors: [
      {
        output: 'DP-1',
        label: 'Monitor',
        command: 'fake-monitor-DP-1',
        horizontalCommand: 'fake-horizontal-DP-1',
        verticalCommand: 'fake-vertical-DP-1',
      },
    ],
  },
  audio: {
    outputs: [
      { label: 'Cuffie', match: 'USB Headset' },
      { label: 'Monitor', match: 'HDMI Monitor' },
    ],
  },
  server: { host: '127.0.0.1', allowedOrigins: [] },
};

const run = createFakeDesktop();
const app = buildServer({ dbPath: ':memory:', deps: { run }, config });
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
const artKey = createHash('sha256')
  .update(new URL('./modules/media/fixtures/cover.png', import.meta.url).href)
  .digest('hex')
  .slice(0, 16);

void test('media.onState pushes the current state, then the new one right after play/pause', async () => {
  const client = connect();
  await client.subscribe('media.onState');
  assert.deepEqual(await client.next(), started);
  assert.deepEqual(
    await client.next(),
    data({ status: 'Playing', artist: 'Artist', title: 'Title', lengthMs: 213000, artKey, positionMs: 12000 }),
  );

  // The poll interval is 1 s and `next` gives up after 0.5 s: only the refresh after the mutation can win.
  const res = await app.inject({
    method: 'POST',
    url: '/trpc/media.playPause',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    await client.next(),
    data({ status: 'Paused', artist: 'Artist', title: 'Title', lengthMs: 213000, artKey, positionMs: 12000 }),
  );
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
      volume: 0.8,
      muted: false,
      micMuted: false,
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
      volume: 0.8,
      muted: false,
      micMuted: false,
    }),
  );
  client.close();
});

void test('monitor orientation pushes the new state immediately after its command', async (t) => {
  const client = connect();
  t.after(() => client.close());
  await client.subscribe('system.onMonitors');
  assert.deepEqual(await client.next(), started);
  await client.next();
  const res = await app.inject({
    method: 'POST',
    url: '/trpc/system.monitor.setOrientation',
    headers: { 'content-type': 'application/json' },
    payload: { output: 'DP-1', orientation: 'vertical' },
  });
  assert.equal(res.statusCode, 200);
  // A 500 ms deadline beats the 5 s poll and proves the action notified the subscription.
  assert.deepEqual(
    await client.next(),
    data([
      {
        output: 'DP-1',
        label: 'Monitor',
        state: 'on',
        orientation: 'vertical',
        supportsHorizontal: true,
        supportsVertical: true,
      },
    ]),
  );
});
