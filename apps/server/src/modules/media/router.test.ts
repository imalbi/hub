import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import type { Run } from '../../core/exec.ts';
import { buildServer } from '../../server.ts';
const failingRun: Run = () => Promise.resolve({ stdout: '', stderr: 'untrusted private diagnostic', code: 1 });

void test('next and previous are protected registry actions with exact playerctl argv', async (t) => {
  const calls: string[][] = [];
  const fake = createFakeDesktop();
  const run: Run = (bin, args, options) => {
    calls.push([bin, ...args]);
    return fake(bin, args, options);
  };
  const app = buildServer({ dbPath: ':memory:', deps: { run } });
  t.after(() => app.close());
  for (const action of ['next', 'previous']) {
    const response = await app.inject({
      method: 'POST',
      url: `/trpc/media.${action}`,
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls.at(-1), ['playerctl', action]);
    const denied = await app.inject({
      method: 'POST',
      url: `/trpc/media.${action}`,
      remoteAddress: '192.0.2.9',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(denied.statusCode, 401);
  }
});

void test('art query ignores caller-supplied source and serves only the current player cover', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'GET',
    url: '/trpc/media.art?input=' + encodeURIComponent(JSON.stringify({ url: 'file:///unrelated-private-file' })),
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /data:image\/png;base64,/);
  assert.equal(response.body.includes('file:'), false);
  const denied = await app.inject({ method: 'GET', url: '/trpc/media.art', remoteAddress: '192.0.2.9' });
  assert.equal(denied.statusCode, 401);
});

void test('the protected art query uses the injected fetch for the current https source', async (t) => {
  const source = 'https://example.com/current-cover';
  const run: Run = () =>
    Promise.resolve({ stdout: `Playing\tArtist\tTitle\t${source}\t60000000\n`, stderr: '', code: 0 });
  const requests: string[] = [];
  const mediaFetch: typeof fetch = (input) => {
    requests.push(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url);
    return Promise.resolve(new Response(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')));
  };
  const app = buildServer({ dbPath: ':memory:', deps: { run, fetch: mediaFetch } });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/trpc/media.art' });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /data:image\/png;base64,/);
  assert.equal(response.body.includes(source), false);
  assert.deepEqual(requests, [source]);
});

void test('failed transport actions return failure without exposing raw player error details', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: failingRun } });
  t.after(() => app.close());
  for (const action of ['next', 'previous', 'playPause']) {
    const response = await app.inject({
      method: 'POST',
      url: `/trpc/media.${action}`,
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.statusCode, 412);
    assert.equal(response.body.includes('untrusted private diagnostic'), false);
  }
});

void test('mpv preference selects the same player for state, artwork and controls, with fallback', async (t) => {
  let mpv = 'Playing';
  const calls: string[][] = [];
  const run: Run = (_bin, args) => {
    calls.push(args);
    if (args[0] === '--player=mpv' && args[1] === 'status')
      return Promise.resolve({ stdout: mpv, stderr: '', code: mpv ? 0 : 1 });
    if (args.includes('metadata'))
      return Promise.resolve({
        stdout: `Playing\tArtist\t${args[0] === '--player=mpv' ? 'mpv' : 'browser'}\t\t\n`,
        stderr: '',
        code: 0,
      });
    return Promise.resolve({ stdout: '', stderr: '', code: 0 });
  };
  const app = buildServer({ dbPath: ':memory:', deps: { run } });
  t.after(() => app.close());
  for (const [status, prefix, title] of [
    ['Playing', ['--player=mpv'], 'mpv'],
    ['Paused', ['--player=mpv'], 'mpv'],
    ['Stopped', [], 'browser'],
    ['', [], 'browser'],
  ] satisfies [string, string[], string][]) {
    mpv = status;
    const state = await app.inject('/trpc/media.state');
    assert.equal(state.json().result.data.title, title);
    assert.deepEqual(calls.at(-1)?.slice(0, -3), prefix);
    await app.inject('/trpc/media.art');
    assert.deepEqual(calls.at(-1)?.slice(0, -3), prefix);
    await app.inject({
      method: 'POST',
      url: '/trpc/media.playPause',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    assert.deepEqual(calls.at(-1), [...prefix, 'play-pause']);
  }
});
