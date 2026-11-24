import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { z } from 'zod';
import { emptyConfig } from './config.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { buildServer } from '../server.ts';

process.env.NODE_ENV = 'test';

// The fake PC: only a request that says so counts as loopback, so a socket from 127.0.0.1 can act as a LAN phone.
const app = buildServer({
  dbPath: ':memory:',
  deps: { run: createFakeDesktop() },
  config: emptyConfig,
  isLoopback: ({ headers }) => headers['x-test-pc'] === '1',
});
let port = 0;
before(async () => {
  port = Number(new URL(await app.listen({ host: '127.0.0.1', port: 0 })).port);
});
after(() => app.close());

const envelope = z.object({ result: z.object({ data: z.unknown() }).optional() });
async function pairPhone() {
  const pc = { 'content-type': 'application/json', 'x-test-pc': '1' };
  const created = await app.inject({ method: 'POST', url: '/trpc/pairing.createCode', headers: pc, payload: '{}' });
  const { code } = z.object({ code: z.string() }).parse(envelope.parse(created.json()).result?.data);
  const redeemed = await app.inject({
    method: 'POST',
    url: '/trpc/pairing.redeem',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ code, deviceName: 'Socket phone' }),
  });
  return z.object({ token: z.string() }).parse(envelope.parse(redeemed.json()).result?.data).token;
}

/** A tRPC WebSocket that sends its token as connection params, the way the deck does. */
function connect(token?: string, path = 'media.onState') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/trpc?connectionParams=1`, {
    headers: { Origin: 'http://127.0.0.1:5173' },
  });
  const messages: unknown[] = [];
  let closed = false;
  ws.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))));
  ws.addEventListener('close', () => (closed = true));
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ method: 'connectionParams', data: token ? { token } : null }));
    ws.send(JSON.stringify({ id: 1, method: 'subscription', params: { path } }));
  });
  const until = async (done: () => boolean) => {
    for (let waited = 0; !done() && waited < 2000; waited += 20) await new Promise((r) => setTimeout(r, 20));
    assert.ok(done(), `condition not met, got ${JSON.stringify(messages)}`);
  };
  return { messages, until, isClosed: () => closed, close: () => ws.close() };
}

const errorCode = (message: unknown) =>
  z.object({ error: z.object({ data: z.object({ code: z.string() }) }) }).safeParse(message).data?.error.data.code;

void test('a subscription from a LAN socket without a token is refused', async () => {
  const client = connect();
  await client.until(() => client.messages.some((m) => errorCode(m) === 'UNAUTHORIZED'));
  client.close();
});

void test('a subscription with a valid token over connection params gets the state', async () => {
  const client = connect(await pairPhone());
  await client.until(() => client.messages.some((m) => JSON.stringify(m).includes('"type":"data"')));
  assert.ok(!client.messages.some((m) => errorCode(m)));
  client.close();
});

void test('revoking a device closes its open socket', async () => {
  const token = await pairPhone();
  const client = connect(token);
  await client.until(() => client.messages.length > 0);
  const list = await app.inject({ method: 'GET', url: '/trpc/devices.list', headers: { 'x-test-pc': '1' } });
  // Devices come in id order and this test paired the newest one.
  const device = z
    .array(z.object({ id: z.number() }))
    .parse(envelope.parse(list.json()).result?.data)
    .at(-1);
  assert.ok(device);
  await app.inject({
    method: 'POST',
    url: '/trpc/devices.revoke',
    headers: { 'content-type': 'application/json', 'x-test-pc': '1' },
    payload: JSON.stringify({ id: device.id, confirmed: true }),
  });
  await client.until(() => client.isClosed());
});
