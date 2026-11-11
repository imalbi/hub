import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyQueue, queueReducer } from './queue.ts';

const song = (id: string) => ({ id, title: id, artists: [] });

void test('refill excludes the seed and played songs; advance and skip move forward', () => {
  let state = queueReducer(emptyQueue, { type: 'play', song: song('a') });
  state = queueReducer(state, { type: 'refill', songs: [song('a'), song('b'), song('b'), song('c')] });
  assert.deepEqual(
    state.upcoming.map((item) => item.id),
    ['b', 'c'],
  );
  state = queueReducer(state, { type: 'advance', error: false });
  assert.equal(state.current?.id, 'b');
  assert.deepEqual(state.played, ['a']);
  state = queueReducer(state, { type: 'advance', error: false });
  assert.equal(state.current?.id, 'c');
});

void test('three consecutive playback errors stop the queue', () => {
  let state = queueReducer(emptyQueue, { type: 'play', song: song('a') });
  state = queueReducer(state, { type: 'refill', songs: ['b', 'c', 'd'].map(song) });
  for (let i = 0; i < 3; i++) state = queueReducer(state, { type: 'advance', error: true });
  assert.equal(state.current, null);
  assert.equal(state.errors, 3);
});
