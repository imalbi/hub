import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMediaState } from './playerctl.ts';

void test('parses a playing track', () => {
  assert.deepEqual(parseMediaState({ stdout: 'Playing\tSome Artist\tSome Title\n', stderr: '', code: 0 }), {
    status: 'Playing',
    artist: 'Some Artist',
    title: 'Some Title',
    lengthMs: null,
    artKey: null,
  });
});

void test('parses a paused track and keeps tabs inside the title', () => {
  assert.deepEqual(parseMediaState({ stdout: 'Paused\tArtist\tPart 1\tPart 2\n', stderr: '', code: 0 }), {
    status: 'Paused',
    artist: 'Artist',
    title: 'Part 1\tPart 2',
    lengthMs: null,
    artKey: null,
  });
});

void test('no running player is null, not an error', () => {
  assert.equal(parseMediaState({ stdout: '', stderr: 'No players found\n', code: 1 }), null);
});

void test('extended metadata keeps tabs in titles and exposes only a short artwork key and milliseconds', () => {
  const url = 'https://example.com/cover.png';
  const state = parseMediaState({
    stdout: `Playing\tArtist\tPart 1\tPart 2\t${url}\t213000000\n`,
    stderr: '',
    code: 0,
  });
  assert.equal(state?.title, 'Part 1\tPart 2');
  assert.equal(state?.lengthMs, 213000);
  assert.match(state?.artKey ?? '', /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(state).includes(url), false);
});

void test('empty art and invalid lengths remain null without losing a valid track', () => {
  for (const length of ['', '-12', 'Infinity', 'not-a-number']) {
    const state = parseMediaState({ stdout: `Paused\tArtist\tTitle\t\t${length}\n`, stderr: '', code: 0 });
    assert.equal(state?.title, 'Title');
    assert.equal(state?.lengthMs, null);
    assert.equal(state?.artKey, null);
  }
});
