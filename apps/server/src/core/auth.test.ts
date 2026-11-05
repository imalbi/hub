import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, afterEach, mock, test } from 'node:test';
import { z } from 'zod';
import { isLoopbackPeer } from './auth.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { buildServer } from '../server.ts';

process.env.NODE_ENV = 'test';

const LAN = '192.0.2.20';
// No `isLoopback` option: this is the server `index.ts` builds, so it proves the production default.
const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
after(() => app.close());
afterEach(() => mock.timers.reset());

const envelope = z.object({
  result: z.object({ data: z.unknown().optional() }).optional(),
  error: z.object({ data: z.object({ code: z.string() }) }).optional(),
});
type Options = { input?: unknown; remoteAddress?: string; token?: string; headers?: Record<string, string> };

/** One tRPC call through `inject`; `remoteAddress` is the TCP peer, `127.0.0.1` unless said otherwise. */
async function call(method: 'GET' | 'POST', path: string, { input, remoteAddress, token, headers }: Options = {}) {
  const res = await app.inject({
    method,
    url: `/trpc/${path}`,
    remoteAddress,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers },
    payload: method === 'POST' ? JSON.stringify(input ?? {}) : undefined,
  });
  const body = envelope.parse(res.json());
  return { status: res.statusCode, data: body.result?.data, code: body.error?.data.code };
}

async function pair(deviceName = 'Test phone') {
  const created = z.object({ code: z.string() }).parse((await call('POST', 'pairing.createCode')).data);
  const redeemed = await call('POST', 'pairing.redeem', {
    input: { code: created.code, deviceName },
    remoteAddress: LAN,
  });
  assert.equal(redeemed.status, 200);
  return z.object({ token: z.string() }).parse(redeemed.data).token;
}

const deviceList = async () =>
  z
    .array(z.object({ id: z.number(), name: z.string(), lastSeenAt: z.number() }))
    .parse((await call('GET', 'devices.list')).data);

void test('a loopback peer needs no token for a protected procedure', async () => {
  assert.equal((await call('GET', 'health')).status, 200);
  assert.equal((await call('GET', 'health', { remoteAddress: '::1' })).status, 200);
});

const peer = (remoteAddress?: string) => ({ socket: { remoteAddress }, headers: {} });

void test('the real loopback check trusts the machine itself and nothing else', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1'])
    assert.equal(isLoopbackPeer(peer(address)), true, address);
  for (const address of [LAN, '0.0.0.0', '127.0.0.2.evil', '', undefined])
    assert.equal(isLoopbackPeer(peer(address)), false, String(address));
  // A header that claims to be the PC changes nothing.
  assert.equal(
    isLoopbackPeer({
      socket: { remoteAddress: LAN },
      headers: { host: 'localhost:4180', 'x-forwarded-for': '127.0.0.1' },
    }),
    false,
  );
});

void test('a LAN peer without a token is refused on a protected procedure', async () => {
  const res = await call('GET', 'health', { remoteAddress: LAN });
  assert.deepEqual([res.status, res.code], [401, 'UNAUTHORIZED']);
});

void test('a LAN peer cannot claim to be the PC through X-Forwarded-For', async () => {
  const res = await call('GET', 'health', { remoteAddress: LAN, headers: { 'x-forwarded-for': '127.0.0.1' } });
  assert.equal(res.status, 401);
});

void test('a paired device is trusted on the LAN, a made-up token is not', async () => {
  const token = await pair();
  assert.equal((await call('GET', 'health', { remoteAddress: LAN, token })).status, 200);
  assert.equal((await call('GET', 'health', { remoteAddress: LAN, token: 'not-a-token' })).status, 401);
});

void test('a revoked device is refused at once', async () => {
  const token = await pair('Revoked phone');
  const device = (await deviceList()).find((d) => d.name === 'Revoked phone');
  assert.ok(device);
  assert.equal((await call('POST', 'devices.revoke', { input: { id: device.id, confirmed: true } })).status, 200);
  assert.equal((await call('GET', 'health', { remoteAddress: LAN, token })).status, 401);
});

void test('device administration and codes are for the PC only', async () => {
  const token = await pair();
  for (const [method, path] of [
    ['GET', 'devices.list'],
    ['POST', 'pairing.createCode'],
  ] as const) {
    assert.equal((await call(method, path, { remoteAddress: LAN, token })).code, 'FORBIDDEN', `${path} as a device`);
    assert.equal((await call(method, path, { remoteAddress: LAN })).code, 'UNAUTHORIZED', `${path} as anonymous`);
  }
});

const lastSeenOf = async (name: string) => (await deviceList()).find((d) => d.name === name)?.lastSeenAt;

void test('last seen is refreshed at most once a minute', async () => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const token = await pair('Clocked phone');
  assert.equal(await lastSeenOf('Clocked phone'), 1_000_000);
  mock.timers.tick(30_000);
  await call('GET', 'health', { remoteAddress: LAN, token });
  assert.equal(await lastSeenOf('Clocked phone'), 1_000_000);
  mock.timers.tick(31_000);
  await call('GET', 'health', { remoteAddress: LAN, token });
  assert.equal(await lastSeenOf('Clocked phone'), 1_061_000);
});

const guess = (remoteAddress: string) =>
  call('POST', 'pairing.redeem', { input: { code: '000000', deviceName: 'Guesser' }, remoteAddress });

void test('five wrong codes from one address end in a 429 for the rest of the minute', async () => {
  for (let attempt = 0; attempt < 5; attempt++) assert.deepEqual((await guess('192.0.2.99')).code, 'BAD_REQUEST');
  const locked = await guess('192.0.2.99');
  assert.deepEqual([locked.status, locked.code], [429, 'TOO_MANY_REQUESTS']);
  // Another address still gets the plain answer.
  assert.equal((await guess('192.0.2.98')).code, 'BAD_REQUEST');
});

void test('redeeming returns the token once and the database keeps only its hash', async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'hub-auth-')), 'hub.db');
  const own = buildServer({ dbPath, deps: { run: createFakeDesktop() } });
  const code = z.object({ code: z.string() }).parse(
    envelope.parse(
      (
        await own.inject({
          method: 'POST',
          url: '/trpc/pairing.createCode',
          headers: { 'content-type': 'application/json' },
          payload: '{}',
        })
      ).json(),
    ).result?.data,
  ).code;
  const res = await own.inject({
    method: 'POST',
    url: '/trpc/pairing.redeem',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ code, deviceName: 'Hash phone' }),
  });
  const token = z.object({ token: z.string() }).parse(envelope.parse(res.json()).result?.data).token;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
  await own.close();

  const stored = new DatabaseSync(dbPath).prepare('SELECT * FROM devices').all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.['token_hash'], createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(stored).includes(token));
});
