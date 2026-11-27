import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { openDb } from '../db/index.ts';
import { publicModules } from '../modules.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { createDeviceSockets } from './auth.ts';
import { coreConfigSchema } from './config-schema.ts';
import { emptyConfig } from './config.ts';
import { streamSpawn } from './exec.ts';
import { createFiles } from './files.ts';
import { createJobRunner } from './jobs.ts';
import { createModuleStates } from './module-states.ts';
import { formSchema, getAt, isObject } from './settings-config.ts';
import { createSettingsRouter } from './settings-router.ts';

void test('agent settings save refuses an entire change containing a secret', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-agent-settings-'));
  const path = join(dir, 'config.json');
  const original = JSON.stringify({ modulesOff: ['example'], modules: { example: { name: 'before', secret: 'old' } } });
  await writeFile(path, original);
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });
  const states = createModuleStates();
  states.set({
    name: 'example',
    kind: 'private',
    status: 'on',
    configPath: ['modules', 'example'],
    schema: z.object({ name: z.string(), secret: z.string().meta({ secret: true }) }),
  });
  const caller = createSettingsRouter({ states, configPath: path }).createCaller({
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    client: { kind: 'agent', agentId: 1, name: 'Test' },
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  });
  await assert.rejects(caller.save({ module: 'example', value: { name: 'after', secret: 'new' } }), /manual change/);
  assert.equal(await readFile(path, 'utf8'), original);
  const result = await caller.save({
    module: 'example',
    value: { name: 'after', secret: { set: true } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).modules.example, { name: 'after', secret: 'old' });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).modulesOff, ['example']);
});

void test('a human-confirmed agent restore cannot change a manual host', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-agent-restore-'));
  const path = join(dir, 'config.json');
  const original = JSON.stringify({ server: { host: '127.0.0.1' } });
  await writeFile(path, original);
  await writeFile(`${path}.bak`, JSON.stringify({ server: { host: '0.0.0.0' } }));
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });
  const caller = createSettingsRouter({ states: createModuleStates(), configPath: path }).createCaller({
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    client: { kind: 'loopback' },
    agentRequest: true,
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  });
  await assert.rejects(caller.restore({ confirmed: true }));
  assert.equal(await readFile(path, 'utf8'), original);
});

void test('core settings allow bounded agent edits and preserve omitted fields', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-core-settings-'));
  const path = join(dir, 'config.json');
  const initial = {
    server: { host: '127.0.0.1', allowedOrigins: ['https://example.test'], deviceTokenTtlDays: 30 },
    backup: { enabled: false, dir: '/tmp/hub-backups', keep: 10 },
    assistant: { enabled: true, model: 'chat-test', decisionModel: 'decision-test', numCtx: 8192 },
    mcp: { enabled: true, client: 'codex' },
    modulesOff: ['example'],
    extra: { untouched: true },
  };
  await writeFile(path, JSON.stringify(initial));
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });
  const settings = createSettingsRouter({ states: createModuleStates(), configPath: path });
  const context = {
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  };
  const agent = settings.createCaller({ ...context, client: { kind: 'agent', agentId: 1, name: 'Test' } });
  const core = await agent.core();
  const value = coreConfigSchema.parse(core.value);
  assert.equal(value.mcp.client, 'codex');
  assert.equal(isObject(core.value) && 'server' in core.value, false);
  assert.equal('server' in (core.schema.properties ?? {}), false);
  assert.equal(getAt(core.schema, ['properties', 'mcp', 'properties', 'enabled', 'manual']), true);
  assert.deepEqual(await agent.modules(), []);
  assert.equal(
    (await agent.saveCore({ jobs: { maxConcurrent: 3 }, assistant: { model: 'new-chat' }, backup: { keep: 20 } })).ok,
    true,
  );
  const saved = {
    ...initial,
    jobs: { maxConcurrent: 3 },
    assistant: { ...initial.assistant, model: 'new-chat' },
    backup: { ...initial.backup, keep: 20 },
  };
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), saved);
  const confirmedAgent = settings.createCaller({ ...context, client: { kind: 'loopback' }, agentRequest: true });
  for (const caller of [agent, confirmedAgent]) {
    for (const patch of [{ backup: { dir: '/tmp/other-backups' } }, { mcp: { enabled: false } }]) {
      const before = await readFile(path, 'utf8');
      await assert.rejects(caller.saveCore(patch), /manual change/);
      assert.equal(await readFile(path, 'utf8'), before);
    }
  }
  await assert.rejects(agent.saveCore({ jobs: { maxConcurrent: 0 } }));
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), saved);
  const human = settings.createCaller({ ...context, client: { kind: 'loopback' } });
  const input = { mcp: { enabled: false }, backup: { dir: '/tmp/manual-backups' } };
  assert.equal((await human.saveCore(input)).ok, true);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
    ...saved,
    mcp: { ...saved.mcp, enabled: false },
    backup: { ...saved.backup, dir: '/tmp/manual-backups' },
  });
  assert.equal((await human.saveCore({ assistant: { decisionModel: '  new-decision  ' } })).ok, true);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).assistant.decisionModel, 'new-decision');
});

void test('an agent never reads the raw slice of a module without a schema', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-agent-raw-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ modules: { opaque: { token: 'not-for-agents' } } }));
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });
  const states = createModuleStates();
  states.set({ name: 'opaque', kind: 'private', status: 'on', configPath: ['modules', 'opaque'], schema: undefined });
  const settings = createSettingsRouter({ states, configPath: path });
  const context = {
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  };
  const agent = settings.createCaller({ ...context, client: { kind: 'agent', agentId: 1, name: 'Test' } });
  assert.equal((await agent.config({ module: 'opaque' })).value, null);
  const human = settings.createCaller({ ...context, client: { kind: 'loopback' } });
  assert.deepEqual((await human.config({ module: 'opaque' })).value, { token: 'not-for-agents' });
});

void test('two concurrent saves both land and leave a valid file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-concurrent-settings-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ modules: {} }));
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });
  const states = createModuleStates();
  for (const name of ['one', 'two'])
    states.set({
      name,
      kind: 'private',
      status: 'on',
      configPath: ['modules', name],
      schema: z.object({ label: z.string() }),
    });
  const caller = createSettingsRouter({ states, configPath: path }).createCaller({
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    client: { kind: 'loopback' },
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  });
  const results = await Promise.all([
    caller.save({ module: 'one', enabled: true, value: { label: 'a' } }),
    caller.save({ module: 'two', enabled: true, value: { label: 'b' } }),
  ]);
  assert.deepEqual(
    results.map((result) => result.ok),
    [true, true],
  );
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(saved.modules, { one: { label: 'a' }, two: { label: 'b' } });
  assert.deepEqual((await readdir(dir)).toSorted(), ['config.json', 'config.json.bak']);
});

void test('modules lists a setup note only while the module is on and its slice is missing; a throwing note is none', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-setup-note-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ place: { name: 'x' } }));
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });
  const states = createModuleStates();
  const note = (config: unknown) => (config ? undefined : 'manca qualcosa');
  states.set({ name: 'missing', kind: 'public', status: 'on', configPath: ['missing'], setupNote: note });
  states.set({ name: 'place', kind: 'public', status: 'on', configPath: ['place'], setupNote: note });
  states.set({ name: 'plain', kind: 'public', status: 'on', configPath: ['plain'] });
  states.set({ name: 'off', kind: 'public', status: 'off', configPath: ['off'], setupNote: note });
  states.set({
    name: 'throws',
    kind: 'public',
    status: 'on',
    configPath: ['throws'],
    setupNote: () => {
      throw new Error('boom');
    },
  });
  const caller = createSettingsRouter({ states, configPath: path }).createCaller({
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    client: { kind: 'loopback' },
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  });
  const notes = Object.fromEntries((await caller.modules()).map(({ name, note }) => [name, note]));
  assert.deepEqual(notes, {
    missing: 'manca qualcosa',
    off: undefined,
    place: undefined,
    plain: undefined,
    throws: undefined,
  });
});

void test('agent settings save refuses changes to public command, path and URL fields while allowing labels', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-agent-manual-public-'));
  const path = join(dir, 'config.json');
  const initial = {
    system: {
      powerstatDir: '/var/lib/powerstat',
      monitors: [{ output: 'DP-1', label: 'Primary', command: '/usr/bin/monitor-toggle' }],
    },
    theme: { caelestiaScheme: '/var/tmp/scheme.json' },
    archive: { plansDir: '/var/tmp/plans', materialDirs: ['/var/tmp/materials'] },
    services: [{ name: 'Status', url: 'https://status.example.org' }],
  };
  const original = `${JSON.stringify(initial, null, 2)}\n`;
  await writeFile(path, original);
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  const states = createModuleStates();
  for (const mod of publicModules) {
    const schema = mod.settingsSchema ?? mod.config;
    if (schema) {
      states.set({
        name: mod.name,
        kind: 'public',
        status: 'on',
        configPath: [mod.name],
        schema,
      });
    }
  }
  states.set({ name: 'health', kind: 'public', status: 'on', configPath: ['health'], schema: undefined });

  states.set({
    name: 'archive',
    kind: 'private',
    status: 'on',
    configPath: ['archive'],
    schema: z.object({
      plansDir: z.string().meta({ manual: true }),
      materialDirs: z.array(z.string()).meta({ manual: true }),
    }),
  });

  states.set({
    name: 'services',
    kind: 'private',
    status: 'on',
    configPath: ['services'],
    schema: z.array(z.object({ name: z.string(), url: z.url().meta({ manual: true }) })),
  });

  const caller = createSettingsRouter({ states, configPath: path }).createCaller({
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    client: { kind: 'agent', agentId: 1, name: 'Test' },
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  });

  const refused: Array<{ module: string; value: Record<string, unknown> | unknown[] }> = [
    {
      module: 'system',
      value: {
        ...initial.system,
        monitors: [{ output: 'DP-1', label: 'Primary', command: '/usr/bin/poweroff' }],
      },
    },
    { module: 'system', value: { ...initial.system, monitors: [] } },
    { module: 'system', value: { ...initial.system, powerstatDir: '/etc' } },
    { module: 'theme', value: { caelestiaScheme: '/etc/shadow' } },
    { module: 'archive', value: { ...initial.archive, plansDir: '/tmp/other' } },
    { module: 'archive', value: { ...initial.archive, materialDirs: ['/tmp/other'] } },
    { module: 'services', value: [{ name: 'Status', url: 'https://127.0.0.1/admin' }] },
  ];

  for (const entry of refused) {
    await assert.rejects(
      caller.save({ module: entry.module, value: entry.value }),
      (error: unknown) => error instanceof Error && error.message.includes('manual change'),
      entry.module,
    );
    assert.equal(await readFile(path, 'utf8'), original);
  }

  // Non-manual fields in the same object (monitor label) remain writable by agents.
  const allowed = await caller.save({
    module: 'system',
    value: {
      ...initial.system,
      monitors: [{ output: 'DP-1', label: 'Desk Display', command: '/usr/bin/monitor-toggle' }],
    },
  });
  assert.equal(allowed.ok, true);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).system.monitors[0].label, 'Desk Display');
  assert.equal(JSON.parse(await readFile(path, 'utf8')).modulesOff, undefined);
  assert.equal((await caller.save({ module: 'health' })).ok, true);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).modulesOff, undefined);
  const saved = await readFile(path, 'utf8');
  await assert.rejects(
    caller.save({ module: 'health', enabled: false }),
    (error: unknown) => error instanceof Error && error.message.includes('manual change'),
  );
  assert.equal(await readFile(path, 'utf8'), saved);
});

void test('every public and core config field matching command/path/host/url is marked manual', () => {
  const sensitiveName = /command|page|terminal|file|dir|dirs|scheme|host|url/i;
  // Core `files` is an object section wrapping only `maxUploadMb`, not a file path.
  const allowedNonManual = new Set(['core.files']);
  const missing: string[] = [];

  function walk(scope: string, node: unknown, path: string[]) {
    if (!isObject(node)) return;
    const key = path.at(-1) ?? '';
    const fullPath = `${scope}.${path.join('.')}`;
    if (key && sensitiveName.test(key) && node.manual !== true && !allowedNonManual.has(fullPath)) {
      missing.push(fullPath);
    }
    for (const branchKey of ['anyOf', 'oneOf', 'allOf'] as const) {
      const branches = node[branchKey];
      if (Array.isArray(branches)) for (const branch of branches) walk(scope, branch, path);
    }
    if (isObject(node.properties)) {
      for (const [prop, child] of Object.entries(node.properties)) walk(scope, child, [...path, prop]);
    }
    if (node.items !== undefined) walk(scope, node.items, [...path, '[]']);
    if (isObject(node.additionalProperties)) walk(scope, node.additionalProperties, [...path, '*']);
  }

  walk('core', formSchema(coreConfigSchema), []);
  for (const mod of publicModules) {
    const schema = mod.settingsSchema ?? mod.config;
    if (schema) walk(`public:${mod.name}`, formSchema(schema), []);
  }

  assert.deepEqual(missing, []);
});
