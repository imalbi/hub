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
  server: { deviceTokenTtlDays: 90, host: '127.0.0.1', allowedOrigins: [] },
};

function fakeRun(
  options: {
    sinkVolume?: string;
    sourceVolume?: string;
    missingSource?: boolean;
  } = {},
) {
  const calls: Array<[string, string[]]> = [];
  let sinkVol = options.sinkVolume ?? 'Volume: 0.80';
  let sourceVol = options.sourceVolume ?? 'Volume: 1.00';
  const run: Run = (bin, args) => {
    calls.push([bin, args]);
    if (bin === 'pw-dump') return Promise.resolve({ stdout: dump, stderr: '', code: 0 });
    if (bin === 'wpctl' && args[0] === 'get-volume') {
      if (args[1] === '@DEFAULT_AUDIO_SINK@') return Promise.resolve({ stdout: sinkVol, stderr: '', code: 0 });
      if (args[1] === '@DEFAULT_AUDIO_SOURCE@') {
        if (options.missingSource) return Promise.resolve({ stdout: '', stderr: 'Device not found', code: 1 });
        return Promise.resolve({ stdout: sourceVol, stderr: '', code: 0 });
      }
    }
    if (bin === 'wpctl' && args[0] === 'set-volume') {
      sinkVol = `Volume: ${args[2]}`;
      return Promise.resolve({ stdout: '', stderr: '', code: 0 });
    }
    return Promise.resolve({ stdout: '', stderr: '', code: 0 });
  };
  return { run, calls };
}

void test('audio.state reports the current output, available outputs, volume, muted and micMuted', async () => {
  const { run } = fakeRun({ sinkVolume: 'Volume: 0.75 [MUTED]', sourceVolume: 'Volume: 1.00 [MUTED]' });
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
    volume: 0.75,
    muted: true,
    micMuted: true,
  });
});

void test('audio.state reports micMuted: false when audio source is missing or fails', async () => {
  const { run } = fakeRun({ missingSource: true });
  const res = await buildServer({ dbPath: ':memory:', deps: { run }, config }).inject({
    method: 'GET',
    url: '/trpc/audio.state',
  });
  assert.equal(res.json().result.data.micMuted, false);
});

void test('audio.setVolume sets sink volume clamped between 0 and 1, and rejects invalid inputs', async () => {
  const { run, calls } = fakeRun();
  const app = buildServer({ dbPath: ':memory:', deps: { run }, config });
  const set = (value: unknown) =>
    app.inject({
      method: 'POST',
      url: '/trpc/audio.setVolume',
      headers: { 'content-type': 'application/json' },
      payload: { value },
    });

  assert.equal((await set(0.5)).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '0.5']]);

  assert.equal((await set(1)).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '1']]);

  assert.equal((await set(0)).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '0']]);

  assert.equal((await set(1.5)).statusCode, 400);
  assert.equal((await set(-0.1)).statusCode, 400);
  assert.equal((await set('loud')).statusCode, 400);
});

void test('audio.stepVolume steps up and down by 5% and clamps at 0 and 1', async () => {
  const { run, calls } = fakeRun({ sinkVolume: 'Volume: 0.80' });
  const app = buildServer({ dbPath: ':memory:', deps: { run }, config });
  const step = (direction: 'up' | 'down') =>
    app.inject({
      method: 'POST',
      url: '/trpc/audio.stepVolume',
      headers: { 'content-type': 'application/json' },
      payload: { direction },
    });

  assert.equal((await step('up')).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '0.85']]);

  assert.equal((await step('down')).statusCode, 200);
  // Current sinkVol was updated to 0.85 by set-volume, so step down is 0.80
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '0.8']]);

  // Clamp at 1 when near top
  const top = fakeRun({ sinkVolume: 'Volume: 0.98' });
  const topApp = buildServer({ dbPath: ':memory:', deps: { run: top.run }, config });
  assert.equal(
    (
      await topApp.inject({
        method: 'POST',
        url: '/trpc/audio.stepVolume',
        headers: { 'content-type': 'application/json' },
        payload: { direction: 'up' },
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(top.calls.at(-1), ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '1']]);

  // Clamp at 0 when near bottom
  const bottom = fakeRun({ sinkVolume: 'Volume: 0.02' });
  const bottomApp = buildServer({ dbPath: ':memory:', deps: { run: bottom.run }, config });
  assert.equal(
    (
      await bottomApp.inject({
        method: 'POST',
        url: '/trpc/audio.stepVolume',
        headers: { 'content-type': 'application/json' },
        payload: { direction: 'down' },
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(bottom.calls.at(-1), ['wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '0']]);
});

void test('audio.stepVolume refuses to step from an unreadable volume and never calls set-volume', async () => {
  const { run, calls } = fakeRun({ sinkVolume: 'error: device not found' });
  const res = await buildServer({ dbPath: ':memory:', deps: { run }, config }).inject({
    method: 'POST',
    url: '/trpc/audio.stepVolume',
    headers: { 'content-type': 'application/json' },
    payload: { direction: 'down' },
  });
  assert.equal(res.statusCode, 500);
  assert.ok(!calls.some(([bin, args]) => bin === 'wpctl' && args[0] === 'set-volume'));
});

void test('audio.toggleMute and toggleMicMute invoke wpctl set-mute with toggle', async () => {
  const { run, calls } = fakeRun();
  const app = buildServer({ dbPath: ':memory:', deps: { run }, config });
  const toggle = (path: string) =>
    app.inject({
      method: 'POST',
      url: `/trpc/audio.${path}`,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

  assert.equal((await toggle('toggleMute')).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle']]);

  assert.equal((await toggle('toggleMicMute')).statusCode, 200);
  assert.deepEqual(calls.at(-1), ['wpctl', ['set-mute', '@DEFAULT_AUDIO_SOURCE@', 'toggle']]);
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
