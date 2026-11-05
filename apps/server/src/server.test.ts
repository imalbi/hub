import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

void test('procedure errors never expose a stack or repository paths', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const res = await app.inject({
    method: 'POST',
    url: '/trpc/audio.setOutput',
    headers: { 'content-type': 'application/json' },
    payload: { label: 'Unknown output' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.includes('"stack"'), false);
  assert.equal(res.body.includes(process.cwd()), false);
  assert.equal(res.body.includes(new URL('../../../', import.meta.url).pathname), false);
});

void test('health answers through tRPC', async () => {
  const res = await buildServer({ dbPath: ':memory:' }).inject({ method: 'GET', url: '/trpc/health' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().result.data.ok, true);
});
