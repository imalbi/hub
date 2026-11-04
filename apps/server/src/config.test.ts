import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';

const dir = mkdtempSync(join(tmpdir(), 'hub-config-'));

function configFile(content: string) {
  const path = join(dir, `${Math.random()}.json`);
  writeFileSync(path, content);
  return path;
}

void test('a missing config file is an empty config', () => {
  assert.deepEqual(loadConfig(join(dir, 'missing.json')), { audio: { outputs: [] } });
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
  const example = fileURLToPath(new URL('../../../config.example.json', import.meta.url));
  assert.equal(loadConfig(example).audio.outputs.length > 0, true);
});
