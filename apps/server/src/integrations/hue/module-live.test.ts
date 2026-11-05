import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { getFakeHue } from '../../testing/fake-hue.ts';

process.env.NODE_ENV = 'test';

async function setup(t: test.TestContext) {
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    config: emptyConfig,
    moduleRoots: [],
    exampleModules: true,
  });
  t.after(() => app.close());
  const port = Number(new URL(await app.listen({ host: '127.0.0.1', port: 0 })).port);
  const fake = getFakeHue();
  assert.ok(fake);

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
    const next = (ms = 1000) =>
      queue.length > 0
        ? Promise.resolve(queue.shift())
        : new Promise<unknown>((resolve, reject) => {
            waiting.push(resolve);
            setTimeout(() => reject(new Error(`no message within ${ms}ms`)), ms).unref();
          });
    return {
      next,
      async subscribe() {
        await opened;
        ws.send(JSON.stringify({ id: 1, method: 'subscription', params: { path: 'hue.onState' } }));
        assert.deepEqual(await next(), { id: 1, result: { type: 'started' } });
      },
      close: () => ws.close(),
    };
  }
  return { fake, connect };
}

const data = (value: unknown) => ({ id: 1, result: { type: 'data', data: value } });
const ready = {
  availability: 'ready',
  power: true,
  brightnessPercent: 80,
  model: 'FAKE-1',
  capabilities: { power: true, brightness: true },
};

void test('two subscribers get the current state, then every change once, and unchanged state is not repeated', async (t) => {
  const { fake, connect } = await setup(t);
  const one = connect();
  const two = connect();
  await one.subscribe();
  await two.subscribe();
  assert.deepEqual(await one.next(), data(ready));
  assert.deepEqual(await two.next(), data(ready));
  fake.patch({ power: false });
  assert.deepEqual(await one.next(), data({ ...ready, power: false }));
  assert.deepEqual(await two.next(), data({ ...ready, power: false }));
  fake.patch({ power: false });
  await assert.rejects(one.next(150), /no message/);
  one.close();
  two.close();
});

void test('losing Bluetooth keeps the values but marks them unavailable, and reconnecting refreshes them', async (t) => {
  const { fake, connect } = await setup(t);
  const client = connect();
  await client.subscribe();
  await client.next();
  fake.patch({ availability: 'unavailable' });
  assert.deepEqual(await client.next(), data({ ...ready, availability: 'unavailable' }));
  fake.patch({ availability: 'ready', power: false, brightnessPercent: 10 });
  assert.deepEqual(await client.next(), data({ ...ready, power: false, brightnessPercent: 10 }));
  client.close();
});

void test('the light refresh is wanted while someone subscribes and released when the last one leaves', async (t) => {
  const { fake, connect } = await setup(t);
  assert.equal(fake.watchers, 0);
  const one = connect();
  const two = connect();
  await one.subscribe();
  await two.subscribe();
  assert.equal(fake.watchers, 2);
  one.close();
  two.close();
  for (let waited = 0; fake.watchers > 0 && waited < 2000; waited += 50) await sleep(50);
  assert.equal(fake.watchers, 0);
});

void test('closing the server closes the transport', async (t) => {
  const { fake } = await setup(t);
  assert.equal(fake.closed, false);
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    config: emptyConfig,
    moduleRoots: [],
    exampleModules: true,
  });
  await app.ready();
  const second = getFakeHue();
  assert.ok(second);
  await app.close();
  assert.equal(second.closed, true);
});
