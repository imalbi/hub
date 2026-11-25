import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { demoEnvironment } from './demo.ts';

void test('demo overrides inherited real module roots, build, ports and fixture storage', (t) => {
  for (const key of [
    'HUB_MODULES_ROOT',
    'HUB_INSTALLED_MODULES_ROOT',
    'HUB_E2E_DIST',
    'HUB_E2E_TMP',
    'HUB_VITE_CACHE',
  ]) {
    const previous = process.env[key];
    process.env[key] = 'real-data';
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const env = demoEnvironment('demo-data', 1234, 5678);
  assert.equal(env.HUB_MODULES_ROOT, join('demo-data', 'empty'));
  assert.equal(env.HUB_INSTALLED_MODULES_ROOT, join('demo-data', 'empty'));
  assert.equal(env.HUB_E2E_DIST, join('demo-data', 'empty'));
  assert.equal(env.HUB_E2E_TMP, 'demo-data');
  assert.equal(env.HUB_VITE_CACHE, join('demo-data', 'vite'));
  assert.equal(env.HUB_EXAMPLE_MODULES, '0');
  assert.equal(env.HUB_PORT, '1234');
  assert.equal(env.HUB_E2E_WEB_PORT, '5678');
});
