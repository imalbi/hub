import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { emptyConfig, type Config } from '../../core/config.ts';
import type { Run } from '../../core/exec.ts';
import { buildServer } from '../../server.ts';

process.env.NODE_ENV = 'test';

const dump = readFileSync(new URL('./fixtures/pw-dump.json', import.meta.url), 'utf8');
const config: Config = {
  ...emptyConfig,
  audio: {
    outputs: [
      { label: 'Cuffie', match: 'USB Headset' },
      { label: 'Casse', match: 'Bluetooth Speaker' },
      { label: 'Monitor', match: 'HDMI Monitor' },
    ],
  },
  server: { host: '127.0.0.1', allowedOrigins: [] },
};

function fakeRun() {
  const calls: Array<[string, string[]]> = [];
  const run: Run = (bin, args) => {
    calls.push([bin, args]);
    return Promise.resolve({ stdout: bin === 'pw-dump' ? dump : '', stderr: '', code: 0 });
  };
  return { run, calls };
}

void test('audio.state reports the current output and which outputs are available', async () => {
  const { run } = fakeRun();
  const res = await buildServer({ dbPath: ':memory:', deps: { run }, config }).inject({
    method: 'GET',
    url: '/trpc/audio.state',
  });
  assert.deepEqual(res.json().result.data, {
    current: { label: 'Cuffie' },
    outputs: [
      { label: 'Cuffie', available: true },
      { label: 'Casse', available: false },
      { label: 'Monitor', available: true },
    ],
  });
});

void test('audio.cycleOutput sets the next available sink as default', async () => {
  const { run, calls } = fakeRun();
  const res = await buildServer({ dbPath: ':memory:', deps: { run }, config }).inject({
    method: 'POST',
    url: '/trpc/audio.cycleOutput',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().result.data.label, 'Monitor');
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-default', '51']]);
});

void test('audio.cycleOutput fails without touching wpctl when no configured output is available', async () => {
  const { run, calls } = fakeRun();
  const res = await buildServer({
    dbPath: ':memory:',
    deps: { run },
    config: { ...config, audio: { outputs: [] } },
  }).inject({
    method: 'POST',
    url: '/trpc/audio.cycleOutput',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(res.statusCode, 412);
  assert.equal(
    calls.some(([bin]) => bin === 'wpctl'),
    false,
  );
});

void test('audio.setOutput switches to the output with that label, and refuses unknown or unavailable ones', async () => {
  const { run, calls } = fakeRun();
  const app = buildServer({ dbPath: ':memory:', deps: { run }, config });
  const set = (label: string) =>
    app.inject({
      method: 'POST',
      url: '/trpc/audio.setOutput',
      headers: { 'content-type': 'application/json' },
      payload: { label },
    });
  assert.equal((await set('Monitor')).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-default', '51']]);
  const before = calls.length;
  assert.equal((await set('Nessuna')).statusCode, 404);
  // Casse matches no sink in the fixture.
  assert.equal((await set('Casse')).statusCode, 412);
  assert.equal((await set('')).statusCode, 400);
  assert.ok(calls.slice(before).every(([bin]) => bin !== 'wpctl'));
});
