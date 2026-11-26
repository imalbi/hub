import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertCanListen, loadConfig } from './config.ts';

const dir = mkdtempSync(join(tmpdir(), 'hub-config-'));

function configFile(content: string) {
  const path = join(dir, `${Math.random()}.json`);
  writeFileSync(path, content);
  return path;
}

void test('a missing config file is an empty config', () => {
  assert.deepEqual(loadConfig(join(dir, 'missing.json')), {
    assistant: { enabled: false, model: 'gemma4:12b-it-qat', numCtx: 16384, decisionModel: '' },
    audio: { outputs: [] },
    backup: { enabled: true, keep: 14 },
    jobs: { maxConcurrent: 2 },
    mcp: { enabled: true, client: 'claude' },
    modulesOff: [],
    server: { deviceTokenTtlDays: 90, host: '127.0.0.1', allowedOrigins: [] },
    pomodoro: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
    theme: {},
    system: { monitors: [] },
  });
});

void test('Pomodoro durations accept fractions for fixtures and reject non-positive values', () => {
  assert.equal(loadConfig(configFile('{"pomodoro":{"focusMinutes":0.05}}')).pomodoro.focusMinutes, 0.05);
  for (const pomodoro of [
    { focusMinutes: 0 },
    { shortBreakMinutes: -1 },
    { longBreakMinutes: 0 },
    { longBreakEvery: 1.5 },
  ]) {
    assert.throws(() => loadConfig(configFile(JSON.stringify({ pomodoro }))), /pomodoro/);
  }
});

void test('server.allowedOrigins is read from the config', () => {
  const path = configFile('{ "server": { "allowedOrigins": ["https://hub.example"] } }');
  assert.deepEqual(loadConfig(path).server.allowedOrigins, ['https://hub.example']);
});

void test('an invalid config fails with a message naming the file and the field', () => {
  const path = configFile('{ "audio": { "outputs": [{ "label": "Cuffie" }] } }');
  assert.throws(
    () => loadConfig(path),
    (error: Error) => error.message.includes(path) && error.message.includes('match'),
  );
  assert.throws(() => loadConfig(configFile('not json')), /not valid JSON/);
});

void test('config.example.json is a valid config', () => {
  const example = fileURLToPath(new URL('../../../../config.example.json', import.meta.url));
  assert.equal(loadConfig(example).audio.outputs.length > 0, true);
});

void test('server.host defaults to loopback and can be set', () => {
  assert.equal(loadConfig(join(dir, 'missing.json')).server.host, '127.0.0.1');
  assert.equal(loadConfig(configFile('{ "server": { "host": "0.0.0.0" } }')).server.host, '0.0.0.0');
});

void test('startup refuses a LAN host with an empty origin allowlist, and says what to add', () => {
  const lan = loadConfig(configFile('{ "server": { "host": "0.0.0.0" } }'));
  assert.throws(() => assertCanListen(lan), /allowedOrigins.*http:\/\/<pc-name>\.local:4180/);
  for (const host of ['127.0.0.1', '::1', 'localhost']) {
    assert.doesNotThrow(() => assertCanListen({ ...lan, server: { ...lan.server, host } }));
  }
  assert.doesNotThrow(() =>
    assertCanListen({
      ...lan,
      server: { deviceTokenTtlDays: 90, host: '0.0.0.0', allowedOrigins: ['http://hub.example:4180'] },
    }),
  );
});

void test('device TTL defaults to 90 days and accepts only bounded whole days', () => {
  assert.equal(loadConfig(configFile('{}')).server.deviceTokenTtlDays, 90);
  assert.equal(loadConfig(configFile('{"server":{"deviceTokenTtlDays":7}}')).server.deviceTokenTtlDays, 7);
  for (const deviceTokenTtlDays of [0, -1, 1.5, 366])
    assert.throws(
      () => loadConfig(configFile(JSON.stringify({ server: { deviceTokenTtlDays } }))),
      /deviceTokenTtlDays/,
    );
});
