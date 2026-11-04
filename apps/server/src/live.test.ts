import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { createLiveHub } from './live.ts';

const POLL_MS = 1000;

// Reads walk through `values`; the last one repeats. `reads()` counts how often the hub polled.
function fakeRead<T>(values: T[]) {
  let count = 0;
  const read = () => Promise.resolve(values[Math.min(count++, values.length - 1)]);
  return { read, reads: () => count };
}

async function collect<T>(sub: AsyncIterable<T>, into: T[]) {
  for await (const value of sub) into.push(value);
}

// A generator parked on its next event only ends through the signal, like tRPC's unsubscribe.
async function stop(controller: AbortController, consume: Promise<void>) {
  controller.abort();
  await assert.rejects(consume, { name: 'AbortError' });
}

async function tick() {
  mock.timers.tick(POLL_MS);
  await flush();
}

beforeEach(() => mock.timers.enable({ apis: ['setInterval'] }));
afterEach(() => mock.timers.reset());

void test('the first subscriber gets the current state without waiting for a tick', async () => {
  const hub = createLiveHub(fakeRead(['a']).read, POLL_MS);
  const sub = hub.subscribe();
  assert.deepEqual(await sub.next(), { value: 'a', done: false });
  await sub.return();
});

void test('a value is emitted only when the state changed', async () => {
  const { read, reads } = fakeRead(['a', 'a', 'b', 'b']);
  const hub = createLiveHub(read, POLL_MS);
  const received: string[] = [];
  const controller = new AbortController();
  const consume = collect(hub.subscribe(controller.signal), received);

  await flush();
  await tick(); // read 2: same as the first, nothing emitted
  await tick(); // read 3: changed
  await tick(); // read 4: same again
  assert.equal(reads(), 4);
  assert.deepEqual(received, ['a', 'b']);
  await stop(controller, consume);
});

void test('state is compared by content, not identity', async () => {
  const { read } = fakeRead([{ title: 'x' }, { title: 'x' }, { title: 'y' }]);
  const hub = createLiveHub(read, POLL_MS);
  const received: Array<{ title: string }> = [];
  const controller = new AbortController();
  const consume = collect(hub.subscribe(controller.signal), received);

  await flush();
  await tick();
  await tick();
  assert.deepEqual(received, [{ title: 'x' }, { title: 'y' }]);
  await stop(controller, consume);
});

void test('polling stops when the last subscriber leaves and resumes with the next one', async () => {
  const { read, reads } = fakeRead(['a']);
  const hub = createLiveHub(read, POLL_MS);
  const first = new AbortController();
  const second = new AbortController();
  const a = hub.subscribe(first.signal);
  const b = hub.subscribe(second.signal);
  await Promise.all([a.next(), b.next()]);

  first.abort();
  await assert.rejects(a.next(), { name: 'AbortError' });
  await tick();
  assert.equal(reads(), 2, 'one subscriber left: still polling');

  second.abort();
  await assert.rejects(b.next(), { name: 'AbortError' });
  await tick();
  await tick();
  assert.equal(reads(), 2, 'nobody left: no more reads');

  const c = hub.subscribe();
  await c.next();
  assert.equal(reads(), 3, 'a new subscriber reads fresh state instead of replaying a stale one');
  await c.return();
});

void test('notify() refreshes at once instead of waiting for the next tick', async () => {
  const { read, reads } = fakeRead(['a', 'b']);
  const hub = createLiveHub(read, POLL_MS);
  const sub = hub.subscribe();
  assert.equal((await sub.next()).value, 'a');

  const next = sub.next();
  await hub.notify();
  assert.deepEqual(await next, { value: 'b', done: false });
  assert.equal(reads(), 2);
  await sub.return();
});

void test('notify() without subscribers does not read', async () => {
  const { read, reads } = fakeRead(['a']);
  await createLiveHub(read, POLL_MS).notify();
  assert.equal(reads(), 0);
});

void test('a failing read ends the subscription with that error', async () => {
  const hub = createLiveHub(() => Promise.reject(new Error('boom')), POLL_MS);
  await assert.rejects(hub.subscribe().next(), { message: 'boom' });
});
