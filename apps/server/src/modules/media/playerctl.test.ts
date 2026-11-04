import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMediaState } from './playerctl.ts';

void test('parses a playing track', () => {
  assert.deepEqual(parseMediaState({ stdout: 'Playing\tSome Artist\tSome Title\n', stderr: '', code: 0 }), {
    status: 'Playing',
    artist: 'Some Artist',
    title: 'Some Title',
  });
});

void test('parses a paused track and keeps tabs inside the title', () => {
  assert.deepEqual(parseMediaState({ stdout: 'Paused\tArtist\tPart 1\tPart 2\n', stderr: '', code: 0 }), {
    status: 'Paused',
    artist: 'Artist',
    title: 'Part 1\tPart 2',
  });
});

void test('no running player is null, not an error', () => {
  assert.equal(parseMediaState({ stdout: '', stderr: 'No players found\n', code: 1 }), null);
});
