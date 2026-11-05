/* oxlint-disable no-underscore-dangle -- tRPC exposes procedure type and meta only through _def */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AnyProcedure } from '@trpc/server';
import { z } from 'zod';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { createFakeHue, getFakeHue } from '../../testing/fake-hue.ts';
import { createHueInstance, hueConfigSchema } from './module.ts';

process.env.NODE_ENV = 'test';
const isProcedure = (value: unknown): value is AnyProcedure => typeof value === 'function';
const LAN = '192.0.2.20';

async function setup(t: test.TestContext) {
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    config: emptyConfig,
    moduleRoots: [],
    exampleModules: true,
  });
  t.after(() => app.close());
  await app.ready();
  const fake = getFakeHue();
  assert.ok(fake, 'the example module creates a fake light for this server');
  const post = (path: string, input: object = {}, options: { remoteAddress?: string; token?: string } = {}) =>
    app.inject({
      method: 'POST',
      url: `/trpc/hue.${path}`,
      headers: {
        'content-type': 'application/json',
        ...(options.token && { authorization: `Bearer ${options.token}` }),
      },
      payload: input,
      remoteAddress: options.remoteAddress,
    });
  const get = (options: { remoteAddress?: string; token?: string } = {}) =>
    app.inject({
      method: 'GET',
      url: '/trpc/hue.state',
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      remoteAddress: options.remoteAddress,
    });
  async function pair() {
    const code = z.object({ result: z.object({ data: z.object({ code: z.string() }) }) }).parse(
      (
        await app.inject({
          method: 'POST',
          url: '/trpc/pairing.createCode',
          headers: { 'content-type': 'application/json' },
          payload: {},
        })
      ).json(),
    ).result.data.code;
    const redeemed = await app.inject({
      method: 'POST',
      url: '/trpc/pairing.redeem',
      headers: { 'content-type': 'application/json' },
      payload: { code, deviceName: 'Test phone' },
      remoteAddress: LAN,
    });
    return z.object({ result: z.object({ data: z.object({ token: z.string() }) }) }).parse(redeemed.json()).result.data
      .token;
  }
  return { app, fake, post, get, pair };
}

void test('the PC and a paired phone may read and write; an unpaired device may not', async (t) => {
  const { fake, post, get, pair } = await setup(t);
  assert.equal((await get()).statusCode, 200);
  assert.equal((await get({ remoteAddress: LAN })).statusCode, 401);
  assert.equal((await post('setPower', { on: false }, { remoteAddress: LAN })).statusCode, 401);
  assert.deepEqual(fake.writes, []);
  const token = await pair();
  assert.equal((await get({ remoteAddress: LAN, token })).statusCode, 200);
  assert.equal((await post('setPower', { on: false }, { remoteAddress: LAN, token })).statusCode, 200);
  assert.deepEqual(fake.writes, [{ type: 'setPower', on: false }]);
});

void test('state carries no address, path or BlueZ detail', async (t) => {
  const { get } = await setup(t);
  const body = z.object({ result: z.object({ data: z.record(z.string(), z.unknown()) }) }).parse((await get()).json());
  assert.deepEqual(Object.keys(body.result.data).toSorted(), [
    'availability',
    'brightnessPercent',
    'capabilities',
    'model',
    'power',
  ]);
});

void test('invalid or out of range input never reaches the light', async (t) => {
  const { fake, post } = await setup(t);
  for (const input of [{ percent: 0 }, { percent: 101 }, { percent: 5.5 }, { percent: '50' }, { percent: null }, {}])
    assert.equal((await post('setBrightness', input)).statusCode, 400, JSON.stringify(input));
  for (const input of [{ on: 'yes' }, { on: 1 }, {}]) assert.equal((await post('setPower', input)).statusCode, 400);
  assert.deepEqual(fake.writes, []);
});

void test('valid writes reach only the declared transport method with the exact value', async (t) => {
  const { fake, post } = await setup(t);
  assert.equal((await post('setBrightness', { percent: 30 })).statusCode, 200);
  assert.equal((await post('setPower', { on: true })).statusCode, 200);
  assert.deepEqual(fake.writes, [
    { type: 'setBrightness', percent: 30 },
    { type: 'setPower', on: true },
  ]);
  assert.equal(fake.state().brightnessPercent, 30);
});

void test('an unsupported feature is refused and an unreachable light is a classified failure, not a crash', async (t) => {
  const { fake, post, get } = await setup(t);
  fake.patch({ capabilities: { power: true, brightness: false } });
  assert.equal((await post('setBrightness', { percent: 50 })).statusCode, 412);
  fake.patch({ capabilities: { power: true, brightness: true }, availability: 'unavailable' });
  const failed = await post('setPower', { on: false });
  assert.equal(failed.statusCode, 503);
  const error = z
    .object({ error: z.object({ message: z.string(), data: z.object({ code: z.string() }) }) })
    .parse(failed.json()).error;
  assert.deepEqual([error.message, error.data.code], ['unavailable', 'SERVICE_UNAVAILABLE']);
  assert.deepEqual(fake.writes, []);
  const state = z
    .object({ result: z.object({ data: z.object({ availability: z.string(), power: z.boolean().nullable() }) }) })
    .parse((await get()).json());
  assert.equal(state.result.data.availability, 'unavailable');
  assert.equal(state.result.data.power, true, 'the last observed value stays, marked by the availability');
});

void test('every Hue mutation carries a label and description for the registry', () => {
  const instance = createHueInstance(createFakeHue().transport);
  const mutations = Object.entries<unknown>(instance.router._def.procedures).flatMap(([path, procedure]) =>
    isProcedure(procedure) && procedure._def.type === 'mutation' ? [{ path, procedure }] : [],
  );
  assert.deepEqual(mutations.map((m) => m.path).toSorted(), ['setBrightness', 'setPower']);
  for (const { procedure } of mutations)
    assert.ok(
      z.object({ label: z.string().min(1), description: z.string().min(1) }).safeParse(procedure._def.meta).success,
    );
});

void test('config: nothing is required, and an address, when given, must not be empty', () => {
  assert.deepEqual(hueConfigSchema.parse(undefined), {});
  assert.deepEqual(hueConfigSchema.parse({ address: 'light-a' }), { address: 'light-a' });
  assert.equal(hueConfigSchema.safeParse({ address: '' }).success, false);
});

void test('without BlueZ the light is unavailable and the rest of Hub keeps working', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-hue-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'hue'));
  const api = new URL('../../core/module.ts', import.meta.url).href;
  const hue = new URL('./module.ts', import.meta.url).href;
  await writeFile(
    join(root, 'hue', 'server.ts'),
    `import { defineModule } from ${JSON.stringify(api)}; import { createConfiguredHue, hueConfigSchema } from ${JSON.stringify(hue)}; export default defineModule({ name: 'hue', config: hueConfigSchema, create: ({ config, log, run }) => createConfiguredHue({ config, log, run }) });`,
  );
  // The fake desktop refuses every busctl call, as a machine without BlueZ would.
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    moduleRoots: [root],
    config: emptyConfig,
  });
  t.after(() => app.close());
  const state = await app.inject('/trpc/hue.state');
  assert.equal(state.statusCode, 200);
  for (const path of ['health', 'audio.state', 'pomodoro.state'])
    assert.equal((await app.inject(`/trpc/${path}`)).statusCode, 200, path);
  const write = await app.inject({
    method: 'POST',
    url: '/trpc/hue.setPower',
    headers: { 'content-type': 'application/json' },
    payload: { on: true },
  });
  assert.equal(write.statusCode, 503);
});
