import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Config } from '../../config.ts';
import type { Run } from '../../exec.ts';
import { buildServer } from '../../server.ts';

process.env.NODE_ENV = 'test';

const dump = readFileSync(new URL('./fixtures/pw-dump.json', import.meta.url), 'utf8');
const config: Config = {
  audio: {
    outputs: [
      { label: 'Cuffie', match: 'USB Headset' },
      { label: 'Casse', match: 'Bluetooth Speaker' },
      { label: 'Monitor', match: 'HDMI Monitor' },
    ],
  },
  server: { allowedOrigins: [] },
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
  const res = await buildServer({ dbPath: ':memory:', run, config }).inject({
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
  const res = await buildServer({ dbPath: ':memory:', run, config }).inject({
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
  const res = await buildServer({ dbPath: ':memory:', run, config: { ...config, audio: { outputs: [] } } }).inject({
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
