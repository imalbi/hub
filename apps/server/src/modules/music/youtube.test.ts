import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapSongs } from './youtube.ts';

void test('maps song fields and counts missing identifiers', () => {
  const { songs, dropped } = mapSongs([
    {
      id: 'abcdefghijk',
      title: 'Song',
      artists: [{ name: 'Artist', channel_id: 'UC123' }],
      album: { name: 'Album' },
      duration: { seconds: 123 },
      thumbnail: { contents: [{ url: 'https://example.org/art' }] },
    },
    { title: 'No id' },
  ]);
  assert.deepEqual(songs, [
    {
      id: 'abcdefghijk',
      title: 'Song',
      artists: [{ name: 'Artist', id: 'UC123' }],
      album: 'Album',
      seconds: 123,
      cover: 'https://example.org/art',
    },
  ]);
  assert.equal(dropped, 1);
});
