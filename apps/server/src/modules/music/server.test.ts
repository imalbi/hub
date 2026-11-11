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
