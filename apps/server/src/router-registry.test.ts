import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

void test('registry lists all public mutations with labels, descriptions and their real input schemas', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const response = await app.inject('/trpc/registry.list');
  assert.equal(response.statusCode, 200);
  const actions = response.json().result.data;
  assert.equal(actions.find((a: { path: string }) => a.path === 'jobs.output')?.kind, 'query');
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.config')?.kind, 'query');
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.save')?.kind, 'mutation');
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.restore')?.kind, 'mutation');
  assert.equal(actions.length, 67);
  assert.equal(actions.find((a: { path: string }) => a.path === 'study.openMaterial')?.kind, 'mutation');
  // The palette runs an input-less action at once: a tag field here would turn "Avvia Pomodoro" into a form.
  assert.equal(actions.find((a: { path: string }) => a.path === 'pomodoro.start')?.schema, null);
  for (const action of actions) {
    assert.ok(action.label.trim());
    assert.ok(action.description.trim());
    assert.equal(typeof action.danger, 'boolean');
    assert.ok('schema' in action);
  }
  assert.deepEqual(actions.find((a: { path: string }) => a.path === 'audio.setVolume').schema, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { value: { type: 'number', minimum: 0, maximum: 1 } },
    required: ['value'],
  });
  assert.deepEqual(actions.find((a: { path: string }) => a.path === 'audio.setOutput').schema, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { label: { type: 'string', minLength: 1 } },
    required: ['label'],
  });
  assert.equal(actions.find((a: { path: string }) => a.path === 'media.playPause').schema, null);
  assert.equal(actions.find((a: { path: string }) => a.path === 'system.powerOff').danger, true);
  assert.ok(!actions.some((a: { path: string }) => a.path === 'registry.list'));
});

void test('registry is protected and automatically includes optional module actions and ranges', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, exampleModules: true });
  t.after(() => app.close());
  const response = await app.inject('/trpc/registry.list');
  assert.equal(response.statusCode, 200);
  const actions = response.json().result.data;
  assert.equal(actions.length, 73);
  const brightness = actions.find((a: { path: string }) => a.path === 'hue.setBrightness');
  assert.equal(brightness.schema.properties.percent.minimum, 1);
  assert.equal(brightness.schema.properties.percent.maximum, 100);
  assert.equal(brightness.schema.properties.percent.type, 'integer');
  assert.ok(actions.some((a: { path: string }) => a.path === 'hello.greet'));
  const remote = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, isLoopback: () => false });
  t.after(() => remote.close());
  assert.equal((await remote.inject('/trpc/registry.list')).statusCode, 401);
});
