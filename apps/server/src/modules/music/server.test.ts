import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { calls, wiring } from './test-wiring.ts';

void test('public playlist rejects invalid ids before YouTube is called', async (t) => {
  const app = buildServer({ dbPath: ':memory:', music: wiring, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const response = await app.inject(
    '/trpc/music.publicPlaylist?input=' + encodeURIComponent(JSON.stringify({ id: '../bad' })),
  );
  assert.equal(response.statusCode, 400);
});

void test('public playlist play and save answer 503 without the YouTube error text', async (t) => {
  const youtube = {
    ...wiring.youtube,
    async playlist(): Promise<never> {
      throw new Error('upstream detail 1234');
    },
  };
  const app = buildServer({ dbPath: ':memory:', music: { ...wiring, youtube }, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  for (const path of ['playPublicPlaylist', 'savePublicPlaylist']) {
    const response = await app.inject({
      method: 'POST',
      url: `/trpc/music.${path}`,
      payload: { id: 'PLabc' },
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.statusCode, 503, path);
    assert.equal(response.body.includes('upstream detail'), false, path);
  }
});

void test('playlists keep dense positions when songs are reordered and removed', async (t) => {
  const app = buildServer({ dbPath: ':memory:', music: wiring, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const mutate = (name: string, payload: object) => app.inject({ method: 'POST', url: `/trpc/music.${name}`, payload });
  const created = await mutate('createPlaylist', { name: 'Mix' });
  assert.equal(created.statusCode, 200);
  const playlistId = created.json().result.data.id;
  for (const [id, title] of [
    ['abcdefghijk', 'First'],
    ['00000000001', 'Second'],
    ['00000000002', 'Third'],
  ]) {
    assert.equal((await mutate('addToPlaylist', { playlistId, id, title, artist: 'Artist' })).statusCode, 200);
  }
  assert.equal((await mutate('movePlaylistSong', { playlistId, from: 2, to: 0 })).statusCode, 200);
  assert.equal((await mutate('removePlaylistSong', { playlistId, position: 1 })).statusCode, 200);
  const list = await app.inject('/trpc/music.playlist?input=' + encodeURIComponent(JSON.stringify({ id: playlistId })));
  assert.deepEqual(
    list.json().result.data.songs.map(({ id, position }: { id: string; position: number }) => [id, position]),
    [
      ['00000000002', 0],
      ['00000000001', 1],
    ],
  );
});

void test('artist rejects invalid channel ids before accessing YouTube', async (t) => {
  const app = buildServer({ dbPath: ':memory:', music: wiring, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const response = await app.inject('/trpc/music.artist?input=' + encodeURIComponent(JSON.stringify({ id: 'bad' })));
  assert.equal(response.statusCode, 400);
});

void test('artist proxies its banner and album art and keeps top songs for playback', async (t) => {
  calls.commands.length = 0;
  const app = buildServer({
    dbPath: ':memory:',
    music: wiring,
    deps: {
      run: createFakeDesktop(),
      fetch: async () => new Response(Buffer.from('524946460400000057454250', 'hex')),
    },
  });
  t.after(() => app.close());
  const response = await app.inject(
    '/trpc/music.artist?input=' + encodeURIComponent(JSON.stringify({ id: 'UCabcdefghijklmnopqrstuv' })),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes('ytimg.com'), false);
  assert.equal(response.json().result.data.banner, 'data:image/webp;base64,UklGRgQAAABXRUJQ');
  assert.equal(response.json().result.data.albums[0].cover, 'data:image/webp;base64,UklGRgQAAABXRUJQ');
  await app.inject({ method: 'POST', url: '/trpc/music.play', payload: { id: 'abcdefghijk' } });
  assert.equal((await app.inject('/trpc/music.queue')).json().result.data.current.title, 'Artist song');
});

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
    [
      ['loadfile', 'https://music.youtube.com/watch?v=abcdefghijk', 'replace'],
      ['loadfile', 'https://music.youtube.com/watch?v=00000000001', 'append'],
    ],
  );
  // A paused mpv keeps its pause across loadfile, so play must also resume.
  assert.ok(
    calls.commands.some((command) => command[0] === 'set_property' && command[1] === 'pause' && command[2] === false),
  );
  const state = await app.inject('/trpc/music.state');
  assert.equal(state.json().result.data.available, true);
  assert.equal(state.json().result.data.playing.id, 'abcdefghijk');
});

void test('favorites toggle twice and retain metadata without the network', async (t) => {
  const app = buildServer({ dbPath: ':memory:', music: wiring, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const song = { id: 'abcdefghijk', title: 'Song', artist: 'Artist' };
  const toggle = () => app.inject({ method: 'POST', url: '/trpc/music.toggleFavorite', payload: song });
  assert.equal((await toggle()).statusCode, 200);
  const first = await app.inject('/trpc/music.favorites');
  assert.deepEqual(
    first.json().result.data.map(({ id, title, artist }: typeof song) => ({ id, title, artist })),
    [song],
  );
  assert.equal((await toggle()).statusCode, 200);
  assert.deepEqual((await app.inject('/trpc/music.favorites')).json().result.data, []);
});

void test('history records only after 30 seconds of playback, excluding paused time', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let playback = 0;
  const ipc = {
    ...wiring.ipc,
    async request(command: (string | number | boolean)[]) {
      if (command[1] === 'playback-time') return playback;
      return wiring.ipc.request(command);
    },
  };
  const app = buildServer({ dbPath: ':memory:', music: { ...wiring, ipc }, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  await app.inject('/trpc/music.search?input=' + encodeURIComponent(JSON.stringify({ query: 'song' })));
  await app.inject({ method: 'POST', url: '/trpc/music.play', payload: { id: 'abcdefghijk' } });
  const history = async () => (await app.inject('/trpc/music.history')).json().result.data;
  t.mock.timers.tick(30000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(await history(), []);
  playback = 30;
  t.mock.timers.tick(30000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal((await history()).length, 1);
  t.mock.timers.tick(30000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal((await history()).length, 1);
});

void test('skipping before 30 seconds leaves the song out of history', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const ipc = {
    ...wiring.ipc,
    async request(command: (string | number | boolean)[]) {
      if (command[1] === 'playback-time') return 30;
      return wiring.ipc.request(command);
    },
  };
  const app = buildServer({ dbPath: ':memory:', music: { ...wiring, ipc }, deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  await app.inject({ method: 'POST', url: '/trpc/music.play', payload: { id: 'abcdefghijk' } });
  t.mock.timers.tick(29000);
  await app.inject({ method: 'POST', url: '/trpc/music.skip', payload: {} });
  t.mock.timers.tick(30000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual((await app.inject('/trpc/music.history')).json().result.data, []);
});
