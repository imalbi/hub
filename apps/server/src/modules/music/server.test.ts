import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { calls, wiring } from './test-wiring.ts';

void test('search and play validate and conceal remote artwork', async (t) => {
  calls.queries.length = 0;
  calls.commands.length = 0;
  const imageCommands: string[][] = [];
  const fakeDesktop = createFakeDesktop();
  const app = buildServer({
    dbPath: ':memory:',
    music: wiring,
    deps: {
      run: (bin, args, options) => {
        if (bin === 'magick') imageCommands.push(args);
        return fakeDesktop(bin, args, options);
      },
      fetch: async () => new Response(Buffer.from('524946460400000057454250', 'hex')),
    },
  });
  t.after(() => app.close());
  calls.commands.push(['loadfile']);
  const resumed = await app.inject('/trpc/music.state');
  assert.equal(resumed.json().result.data.playing.id, 'abcdefghijk');
  assert.equal(resumed.json().result.data.playing.title, 'Song');
  calls.commands.length = 0;
  const search = await app.inject(
    '/trpc/music.search?input=' + encodeURIComponent(JSON.stringify({ query: '  a song  ' })),
  );
  assert.equal(search.statusCode, 200);
  assert.deepEqual(calls.queries, ['  a song  ']);
  assert.equal(search.body.includes('i.ytimg.com'), false);
  assert.equal(search.json().result.data[0].cover, 'data:image/webp;base64,UklGRgQAAABXRUJQ');
  assert.deepEqual(imageCommands, []);
  const play = (id: string) =>
    app.inject({
      method: 'POST',
      url: '/trpc/music.play',
      headers: { 'content-type': 'application/json' },
      payload: { id },
    });
  assert.equal((await play('bad')).statusCode, 400);
  assert.deepEqual(calls.commands, []);
  assert.equal((await play('abcdefghijk')).statusCode, 200);
  assert.deepEqual(
    calls.commands.filter((command) => command[0] === 'loadfile'),
    [['loadfile', 'https://music.youtube.com/watch?v=abcdefghijk', 'replace']],
  );
  // A paused mpv keeps its pause across loadfile, so play must also resume.
  assert.deepEqual(calls.commands.at(-1), ['set_property', 'pause', false]);
  const state = await app.inject('/trpc/music.state');
  assert.equal(state.json().result.data.available, true);
  assert.equal(state.json().result.data.playing.id, 'abcdefghijk');
});

void test('end-file eof loads the next track once', async (t) => {
  calls.commands.length = 0;
  const app = buildServer({ dbPath: ':memory:', music: wiring, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const play = await app.inject({ method: 'POST', url: '/trpc/music.play', payload: { id: 'abcdefghijk' } });
  assert.equal(play.statusCode, 200);
  await new Promise((resolve) => setImmediate(resolve));
  wiring.ipc.events.emit('event', { event: 'end-file', reason: 'eof' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    calls.commands.filter((command) => command[0] === 'loadfile'),
    [
      ['loadfile', 'https://music.youtube.com/watch?v=abcdefghijk', 'replace'],
      ['loadfile', 'https://music.youtube.com/watch?v=00000000001', 'replace'],
    ],
  );
});

void test('skip loads the next track and resumes a paused mpv', async (t) => {
  calls.commands.length = 0;
  const app = buildServer({ dbPath: ':memory:', music: wiring, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  await app.inject({ method: 'POST', url: '/trpc/music.play', payload: { id: 'abcdefghijk' } });
  await new Promise((resolve) => setImmediate(resolve));
  const skip = await app.inject({
    method: 'POST',
    url: '/trpc/music.skip',
    headers: { 'content-type': 'application/json' },
    payload: {},
  });
  assert.equal(skip.statusCode, 200);
  const last = calls.commands.findLastIndex((command) => command[0] === 'loadfile');
  assert.deepEqual(calls.commands[last], ['loadfile', 'https://music.youtube.com/watch?v=00000000001', 'replace']);
  // A skip pressed while paused would otherwise load the next song and wait silently.
  assert.deepEqual(calls.commands[last + 1], ['set_property', 'pause', false]);
});

void test('three consecutive mpv errors stop without loading a fourth track', async (t) => {
  calls.commands.length = 0;
  const app = buildServer({ dbPath: ':memory:', music: wiring, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  await app.inject({ method: 'POST', url: '/trpc/music.play', payload: { id: 'abcdefghijk' } });
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < 3; i++) wiring.ipc.events.emit('event', { event: 'end-file', reason: 'error' });
  await new Promise((resolve) => setImmediate(resolve));
  const state = (await app.inject('/trpc/music.queue')).json().result.data;
  assert.equal(state.errors, 3);
  assert.equal(state.current, null);
  assert.equal(calls.commands.filter((command) => command[0] === 'loadfile').length, 3);
});

void test('radio refills from the last queued song below three upcoming tracks', async (t) => {
  calls.commands.length = 0;
  const seeds: string[] = [];
  const app = buildServer({
    dbPath: ':memory:',
    music: {
      ...wiring,
      youtube: {
        ...wiring.youtube,
        async upNext(seed: string) {
          seeds.push(seed);
          return wiring.youtube.upNext();
        },
      },
    },
    deps: { run: createFakeDesktop() },
  });
  t.after(() => app.close());
  await app.inject({ method: 'POST', url: '/trpc/music.play', payload: { id: 'abcdefghijk' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seeds, ['abcdefghijk']);
  const skip = await app.inject({
    method: 'POST',
    url: '/trpc/music.skip',
    headers: { 'content-type': 'application/json' },
    payload: 'null',
  });
  assert.equal(skip.statusCode, 200);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seeds, ['abcdefghijk', '00000000003']);
});
