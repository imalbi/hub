import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig, type Config } from '../../core/config.ts';
import type { Run } from '../../core/exec.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

const configured: Config = { ...emptyConfig, news: { page: '/tmp/hub-test-news.html', command: 'webdigest' } };

const timedOut: Run = () => Promise.resolve({ stdout: '', stderr: '', code: -1 });

function setup(t: test.TestContext, config: Config = configured, run?: Run) {
  const news: string[][] = [];
  const app = buildServer({ dbPath: ':memory:', run: run ?? createFakeDesktop({ news }), config });
  t.after(() => app.close());
  const call = (path: string) =>
    app.inject({
      method: 'POST',
      url: `/trpc/news.${path}`,
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
  return { news, call, app };
}

void test('refresh runs the digest with --no-open and a long timeout; open hands the page to xdg-open', async (t) => {
  const timeouts: (number | undefined)[] = [];
  const fake = createFakeDesktop();
  const news: string[][] = [];
  const run: Run = (bin, args, options) => {
    if (bin === 'webdigest' || bin === 'xdg-open') {
      timeouts.push(options?.timeoutMs);
      news.push([bin, ...args]);
    }
    return fake(bin, args, options);
  };
  const { call } = setup(t, configured, run);
  assert.equal((await call('refresh')).statusCode, 200);
  assert.equal((await call('open')).statusCode, 200);
  assert.deepEqual(news, [
    ['webdigest', '--no-open'],
    ['xdg-open', '/tmp/hub-test-news.html'],
  ]);
  assert.deepEqual(timeouts, [60_000, undefined]);
});

void test('a digest that times out answers TIMEOUT; unconfigured news is null and refuses its actions', async (t) => {
  const { call } = setup(t, configured, timedOut);
  assert.equal((await call('refresh')).statusCode, 408);
  const bare = setup(t, emptyConfig);
  assert.equal((await bare.call('refresh')).statusCode, 412);
  assert.equal((await bare.call('open')).statusCode, 412);
  assert.deepEqual(bare.news, []);
  assert.deepEqual((await bare.app.inject('/trpc/news.state')).json(), { result: { data: null } });
});
