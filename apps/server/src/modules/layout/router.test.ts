import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

const items = [
  { widget: 'pomodoro', size: 'medium', x: 0, y: 0 },
  { widget: 'server', size: 'small', x: 6, y: 0 },
];

function server() {
  return buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, config: emptyConfig });
}

async function get(app: ReturnType<typeof server>) {
  const res = await app.inject({
    method: 'GET',
    url: `/trpc/layout.get?input=${encodeURIComponent('{"zone":"overview"}')}`,
  });
  return res.json().result.data;
}

async function post(app: ReturnType<typeof server>, path: string, input: unknown) {
  return app.inject({
    method: 'POST',
    url: `/trpc/${path}`,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(input),
  });
}

void test('a zone has no saved board until one is saved, then it is replaced and reset', async () => {
  const app = server();
  assert.equal(await get(app), null);
  assert.equal((await post(app, 'layout.save', { zone: 'overview', items })).statusCode, 200);
  assert.deepEqual(await get(app), items);
  const moved = [
    { ...items[1], x: 0 },
    { ...items[0], x: 3 },
  ];
  await post(app, 'layout.save', { zone: 'overview', items: moved });
  assert.deepEqual(await get(app), moved);
  assert.equal((await post(app, 'layout.reset', { zone: 'overview' })).statusCode, 200);
  assert.equal(await get(app), null);
  await app.close();
});

void test('only the known shape is saved: zone, id pattern, size, positions on 12 columns', async () => {
  const app = server();
  for (const bad of [
    { zone: 'kitchen', items },
    { zone: 'overview', items: [{ ...items[0], widget: 'Bad Id' }] },
    { zone: 'overview', items: [{ ...items[0], size: 'huge' }] },
    { zone: 'overview', items: [{ ...items[0], x: 12 }] },
    { zone: 'overview', items: [{ ...items[0], y: 1.5 }] },
  ])
    assert.equal((await post(app, 'layout.save', bad)).statusCode, 400, JSON.stringify(bad));
  await app.close();
});

void test('a LAN device without a token cannot read or change the board', async () => {
  const app = server();
  const res = await app.inject({
    method: 'GET',
    url: `/trpc/layout.get?input=${encodeURIComponent('{"zone":"overview"}')}`,
    remoteAddress: '192.0.2.41',
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});
