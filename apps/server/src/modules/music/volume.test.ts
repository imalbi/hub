import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { calls, wiring } from './test-wiring.ts';

function app(music = wiring) {
  return buildServer({ dbPath: ':memory:', music, deps: { run: createFakeDesktop() } });
}
const setVolume = (server: ReturnType<typeof app>, payload: object) =>
  server.inject({ method: 'POST', url: '/trpc/music.setVolume', payload });

void test('setVolume sets mpv volume through the IPC and the state reports it', async (t) => {
  const server = app();
  t.after(() => server.close());
  calls.commands.length = 0;
  assert.equal((await setVolume(server, { volume: 70 })).statusCode, 200);
  assert.deepEqual(calls.commands, [['set_property', 'volume', 70]]);
  const state = await server.inject('/trpc/music.state');
  assert.equal(state.json().result.data.volume, 70);
});

void test('setVolume rejects values outside 0..100 and non-integers without touching mpv', async (t) => {
  const server = app();
  t.after(() => server.close());
  calls.commands.length = 0;
  for (const volume of [-1, 101, 50.5, 'a'])
    assert.equal((await setVolume(server, { volume })).statusCode, 400, String(volume));
  assert.deepEqual(calls.commands, []);
  for (const volume of [0, 100]) assert.equal((await setVolume(server, { volume })).statusCode, 200);
});

void test('with mpv unreachable setVolume is a 503 without the IPC text and state has no volume', async (t) => {
  const ipc = {
    ...wiring.ipc,
    async request(): Promise<never> {
      throw new Error('socket detail 99');
    },
  };
  const server = app({ ...wiring, ipc });
  t.after(() => server.close());
  const response = await setVolume(server, { volume: 40 });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.includes('socket detail'), false);
  const state = (await server.inject('/trpc/music.state')).json().result.data;
  assert.deepEqual([state.available, state.volume], [false, null]);
});
