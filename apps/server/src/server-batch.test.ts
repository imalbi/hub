import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

// tRPC puts every procedure of an HTTP batch in one path parameter; Fastify's default limit (100) answered 414.
void test('a long HTTP batch is answered, not refused for its URL length', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const paths = Array.from({ length: 20 }, () => 'health').join(',');
  const input = encodeURIComponent(JSON.stringify(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, {}]))));
  const response = await app.inject(`/trpc/${paths}?batch=1&input=${input}`);
  assert.equal(response.statusCode, 200);
});
