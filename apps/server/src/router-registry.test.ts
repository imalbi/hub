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
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.modules')?.kind, 'query');
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.core')?.kind, 'query');
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.saveCore')?.kind, 'mutation');
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.save')?.kind, 'mutation');
  assert.equal(actions.find((a: { path: string }) => a.path === 'settings.restore')?.kind, 'mutation');
  assert.equal(actions.length, 60);
  assert.deepEqual(actions.find((a: { path: string }) => a.path === 'settings.save').schema.required, ['module']);
  assert.ok(!actions.some((a: { path: string }) => /^(study|music)\./.test(a.path)));
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
  assert.deepEqual(actions.find((a: { path: string }) => a.path === 'system.monitor.setOrientation').schema, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { output: { type: 'string' }, orientation: { type: 'string', enum: ['horizontal', 'vertical'] } },
    required: ['output', 'orientation'],
  });
  assert.equal(actions.find((a: { path: string }) => a.path === 'system.powerOff').danger, true);
  assert.ok(!actions.some((a: { path: string }) => a.path === 'registry.list'));
  assert.ok(!actions.some((a: { path: string }) => a.path.startsWith('assistant.')));
});

void test('registry is protected and automatically includes optional module actions and ranges', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, exampleModules: true });
  t.after(() => app.close());
  const response = await app.inject('/trpc/registry.list');
  assert.equal(response.statusCode, 200);
  const actions = response.json().result.data;
  assert.equal(actions.length, 62);
  const configure = actions.find((a: { path: string }) => a.path === 'pomodoro.configure');
  assert.equal(configure.schema.properties.longBreakEvery.minimum, 0);
  assert.equal(configure.schema.properties.longBreakEvery.maximum, 100);
  assert.equal(configure.schema.properties.longBreakEvery.type, 'integer');
  assert.equal(configure.schema.properties.sound.type, 'boolean');
  assert.ok(actions.some((a: { path: string }) => a.path === 'hello.greet'));
  assert.ok(actions.some((a: { path: string }) => a.path === 'hello.copyFile'));
  assert.ok(!actions.some((a: { path: string }) => a.path.startsWith('hue.') || a.path.startsWith('airplay.')));
  const remote = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, isLoopback: () => false });
  t.after(() => remote.close());
  assert.equal((await remote.inject('/trpc/registry.list')).statusCode, 401);
});
