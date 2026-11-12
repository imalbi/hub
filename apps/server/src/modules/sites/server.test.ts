import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';

void test('state exposes the results of injected site checks', async (t) => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return new Response(null, { status: url.endsWith('/down') ? 503 : 200 });
  };
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop(), fetch: fetcher },
    config: {
      ...emptyConfig,
      sites: [
        { name: 'Primo', url: 'https://example.com/up' },
        { name: 'Secondo', url: 'https://example.com/down' },
      ],
    },
  });
  t.after(() => app.close());
  const configured = await app.inject({ method: 'GET', url: '/trpc/sites.configured' });
  assert.deepEqual(configured.json(), { result: { data: true } });
  const response = await app.inject({ method: 'GET', url: '/trpc/sites.state' });
  assert.equal(response.statusCode, 200);
  const result: unknown = response.json();
  assert.ok(result && typeof result === 'object' && 'result' in result);
  const output = JSON.stringify(result);
  assert.match(output, /Primo/);
  assert.match(output, /Secondo/);
  assert.match(output, /503/);
  assert.deepEqual(urls.toSorted(), ['https://example.com/down', 'https://example.com/up']);
});
