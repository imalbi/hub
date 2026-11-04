import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from './server.ts';

process.env.NODE_ENV = 'test';

void test('health answers through tRPC', async () => {
  const res = await buildServer({ dbPath: ':memory:' }).inject({ method: 'GET', url: '/trpc/health' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().result.data.ok, true);
});
