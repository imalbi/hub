import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { buildServer } from '../server.ts';
import { emptyConfig } from './config.ts';
import { formSchema, secretPaths, getAt, setAt } from './settings-config.ts';
import { z } from 'zod';

process.env.NODE_ENV = 'test';

const LAN = '192.0.2.20';
const KEY = 'sk-test-0123456789';
// A discovered module with a flat secret, a nested secret and a nested record, the shape of the Lavoro profile.
const vaultSchema = `z.object({
  label: z.string().min(1),
  weights: z.record(z.string(), z.number()).default({}),
  access: z.object({ apiKey: z.string().min(1).meta({ secret: true }) }).optional(),
})`;
const initialFile = {
  modulesOff: [],
  modules: { vault: { label: 'Primo', weights: { a: 1 }, access: { apiKey: KEY } } },
};

async function setup(t: TestContext, file: unknown = initialFile) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-settings-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'root', 'vault'), { recursive: true });
  const api = new URL('./module.ts', import.meta.url).href;
  await writeFile(
    join(dir, 'root', 'vault', 'server.ts'),
    `import { defineModule, z } from ${JSON.stringify(api)};
     import { router, protectedProcedure } from ${JSON.stringify(new URL('./trpc.ts', import.meta.url).href)};
     export default defineModule({ name: 'vault', config: ${vaultSchema}, create: () => ({ router: router({ state: protectedProcedure.query(() => 'ok') }) }) });`,
  );
  // `loose` parses its slice in `create` and names the schema for Impostazioni; `bare` has nothing to edit.
  const loose = (name: string, extra: string) =>
    `import { defineModule, z } from ${JSON.stringify(api)};
     import { router } from ${JSON.stringify(new URL('./trpc.ts', import.meta.url).href)};
     export default defineModule({ name: '${name}', config: z.unknown(), ${extra} create: () => ({ router: router({}) }) });`;
  for (const [name, extra] of [
    ['loose', 'settingsSchema: z.strictObject({ n: z.number() }),'],
    ['bare', ''],
  ] as const) {
    await mkdir(join(dir, 'root', name));
    await writeFile(join(dir, 'root', name, 'server.ts'), loose(name, extra));
  }
  const configPath = join(dir, 'config.json');
  const original = `${JSON.stringify(file, null, 2)}\n`;
  await writeFile(configPath, original);
  await chmod(configPath, 0o600);
  const restarts: number[] = [];
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    moduleRoots: [join(dir, 'root')],
    config: { ...emptyConfig, modules: { vault: initialFile.modules.vault } },
    settings: { configPath, onRestart: () => restarts.push(Date.now()) },
  });
  t.after(() => app.close());
  const call = async (
    path: string,
    { input, token, remoteAddress }: { input?: unknown; token?: string; remoteAddress?: string } = {},
    method: 'GET' | 'POST' = input === undefined || path.endsWith('modules') || path.endsWith('config')
      ? 'GET'
      : 'POST',
  ) => {
    const res = await app.inject({
      method,
      url:
        method === 'GET' && input !== undefined
          ? `/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`
          : `/trpc/${path}`,
      remoteAddress,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      payload: method === 'POST' ? JSON.stringify(input ?? {}) : undefined,
    });
    return { status: res.statusCode, text: res.body, json: res.json() };
  };
  return { call, configPath, original, restarts, read: () => readFile(configPath, 'utf8') };
}

type Res = { json: { result?: { data: unknown } } };
const dataOf = (res: Res) => res.json.result?.data;
const saveResult = z.union([
  z.object({ ok: z.literal(true), restarting: z.boolean() }),
  z.object({ ok: z.literal(false), issues: z.array(z.object({ path: z.array(z.string()), message: z.string() })) }),
]);
const configResult = z.object({
  schema: z.object({
    properties: z.object({ access: z.object({ properties: z.object({ apiKey: z.object({ secret: z.boolean() }) }) }) }),
  }),
  value: z.object({ access: z.object({ apiKey: z.unknown() }) }),
  secrets: z.array(z.array(z.string())),
});

void test('a paired device is refused on every settings procedure, reads included', async (t) => {
  const { call } = await setup(t);
  const created = z.object({ code: z.string() }).parse(dataOf(await call('pairing.createCode', { input: {} })));
  const redeemed = await call('pairing.redeem', {
    input: { code: created.code, deviceName: 'Phone' },
    remoteAddress: LAN,
  });
  const token = z.object({ token: z.string() }).parse(dataOf(redeemed)).token;
  const calls: Array<[string, unknown]> = [
    ['settings.modules', undefined],
    ['settings.config', { module: 'vault' }],
    ['settings.save', { module: 'vault', enabled: true, value: {} }],
    ['settings.restore', { confirmed: true }],
  ];
  for (const [path, input] of calls) {
    const res = await call(path, { input, token, remoteAddress: LAN });
    assert.equal(res.status, 403, path);
    assert.equal(
      z.object({ error: z.object({ data: z.object({ code: z.string() }) }) }).parse(res.json).error.data.code,
      'FORBIDDEN',
      path,
    );
  }
  // The one query a phone may call names modules and nothing else.
  const enabled = await call('modules.enabled', { token, remoteAddress: LAN });
  assert.equal(enabled.status, 200);
  assert.ok(z.array(z.string()).parse(dataOf(enabled)).includes('vault'));
});

void test('an invalid save changes nothing: it answers the zod path, keeps the file and does not restart', async (t) => {
  const { call, read, original, restarts, configPath } = await setup(t);
  const res = await call('settings.save', {
    input: { module: 'vault', enabled: true, value: { label: 5, access: { apiKey: { set: true } } } },
  });
  assert.deepEqual(dataOf(res), {
    ok: false,
    issues: [{ path: ['label'], message: 'Invalid input: expected string, received number' }],
  });
  assert.equal(await read(), original);
  await assert.rejects(stat(`${configPath}.bak`));
  await sleep(50);
  assert.equal(restarts.length, 0);
  // A public module's slice is checked by the full schema, and its path is relative to that slice.
  const pomodoro = await call('settings.save', {
    input: { module: 'pomodoro', enabled: true, value: { focusMinutes: -1 } },
  });
  const refused = saveResult.parse(dataOf(pomodoro));
  assert.ok(!refused.ok);
  assert.deepEqual(refused.issues[0]?.path, ['focusMinutes']);
  assert.equal(await read(), original);
});

void test('a valid save keeps the old file as .bak, writes a file that parses and asks for one restart', async (t) => {
  const { call, read, original, restarts, configPath } = await setup(t);
  const res = await call('settings.save', {
    input: {
      module: 'vault',
      enabled: false,
      value: { label: 'Secondo', weights: { b: 2 }, access: { apiKey: { set: true } } },
    },
  });
  assert.deepEqual(dataOf(res), { ok: true, restarting: true });
  assert.equal(await readFile(`${configPath}.bak`, 'utf8'), original);
  const written = JSON.parse(await read());
  assert.equal(written.modules.vault.label, 'Secondo');
  assert.deepEqual(written.modules.vault.weights, { b: 2 });
  assert.deepEqual(written.modulesOff, ['vault']);
  await sleep(50);
  assert.equal(restarts.length, 1);
  // The file keeps its owner-only mode, and no temporary file is left behind.
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(join(configPath, '..'))).toSorted(), ['config.json', 'config.json.bak', 'root']);
  // Restore swaps the file back, asks for a restart, and refuses without the confirmation.
  assert.equal((await call('settings.restore', { input: {} })).status, 412);
  assert.equal((await call('settings.restore', { input: { confirmed: true } })).status, 200);
  assert.equal(await read(), original);
  await sleep(50);
  assert.equal(restarts.length, 2);
});

void test('restore refuses a backup the server could not start with, and changes nothing', async (t) => {
  const { call, read, original, restarts, configPath } = await setup(t);
  for (const backup of ['{ not json', JSON.stringify({ modulesOff: 'pomodoro' })]) {
    await writeFile(`${configPath}.bak`, backup);
    assert.equal((await call('settings.restore', { input: { confirmed: true } })).status, 412);
    assert.equal(await read(), original);
    assert.equal(await readFile(`${configPath}.bak`, 'utf8'), backup);
  }
  await sleep(50);
  assert.equal(restarts.length, 0);
});

void test('secrets never leave: the read answers { set: true } and a kept secret keeps its stored value', async (t) => {
  const { call, read } = await setup(t);
  const res = await call('settings.config', { input: { module: 'vault' } });
  assert.equal(res.status, 200);
  assert.equal(res.text.includes(KEY), false);
  const data = configResult.parse(dataOf(res));
  assert.deepEqual(data.value.access, { apiKey: { set: true } });
  assert.deepEqual(data.secrets, [['access', 'apiKey']]);
  assert.equal(data.schema.properties.access.properties.apiKey.secret, true);

  // Saving the placeholder back leaves the stored key as it was.
  await call('settings.save', { input: { module: 'vault', enabled: true, value: data.value } });
  assert.equal(JSON.parse(await read()).modules.vault.access.apiKey, KEY);
  // A string replaces it.
  await call('settings.save', {
    input: { module: 'vault', enabled: true, value: { label: 'Primo', access: { apiKey: 'new-key' } } },
  });
  assert.equal(JSON.parse(await read()).modules.vault.access.apiKey, 'new-key');
});

void test('a module that parses its own slice names settingsSchema for the form and the save check', async (t) => {
  const { call, read, original } = await setup(t);
  const listed = z
    .array(z.object({ name: z.string(), hasConfig: z.boolean() }))
    .parse(dataOf(await call('settings.modules')))
    .filter(({ name }) => ['vault', 'loose', 'bare'].includes(name));
  assert.deepEqual(listed, [
    { name: 'bare', hasConfig: false },
    { name: 'loose', hasConfig: true },
    { name: 'vault', hasConfig: true },
  ]);
  const refused = saveResult.parse(
    dataOf(await call('settings.save', { input: { module: 'loose', enabled: true, value: { n: 'x' } } })),
  );
  assert.ok(!refused.ok);
  assert.deepEqual(refused.issues[0]?.path, ['n']);
  assert.equal(await read(), original);
  const saved = saveResult.parse(
    dataOf(await call('settings.save', { input: { module: 'loose', enabled: true, value: { n: 3 } } })),
  );
  assert.ok(saved.ok);
  assert.deepEqual(JSON.parse(await read()).modules.loose, { n: 3 });
});

void test('secretPaths, getAt and setAt on plain values', () => {
  const schema = z.object({
    a: z.string().meta({ secret: true }),
    b: z.object({ c: z.string().meta({ secret: true }), d: z.string() }),
    e: z.string().meta({ secret: true }).nullable(),
  });
  assert.deepEqual(
    secretPaths(schema).toSorted((a, b) => a.join('.').localeCompare(b.join('.'))),
    [['a'], ['b', 'c'], ['e']],
  );
  assert.equal(getAt({ x: { y: 1 } }, ['x', 'y']), 1);
  assert.deepEqual(setAt({}, ['x', 'y'], 1), { x: { y: 1 } });
  assert.deepEqual(setAt({ x: { y: 1, z: 2 } }, ['x', 'y'], undefined), { x: { z: 2 } });
});

void test('without a restart hook a save still writes the file and says nothing will restart', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-settings-dev-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, '{}\n');
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, settings: { configPath } });
  t.after(() => app.close());
  const res = await app.inject({
    method: 'POST',
    url: '/trpc/settings.save',
    headers: { 'content-type': 'application/json' },
    payload: { module: 'pomodoro', enabled: true, value: { focusMinutes: 30 } },
  });
  assert.deepEqual(res.json().result.data, { ok: true, restarting: false });
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).pomodoro.focusMinutes, 30);
});

void test('the switch alone is a save: no value, the slice stays as it is, only modulesOff changes', async (t) => {
  const { call, read } = await setup(t);
  const res = await call('settings.save', { input: { module: 'vault', enabled: false } });
  assert.deepEqual(dataOf(res), { ok: true, restarting: true });
  const written = JSON.parse(await read());
  assert.deepEqual(written.modulesOff, ['vault']);
  assert.deepEqual(written.modules.vault, initialFile.modules.vault);
});

void test('the form schema carries title, description, unit, optionLabels and default', () => {
  const schema = z.object({
    hours: z.number().int().default(4).meta({ title: 'Ore', description: 'Quante ore', unit: 'ore' }),
    mode: z
      .number()
      .int()
      .min(1)
      .max(3)
      .meta({ title: 'Modalita', optionLabels: { 1: 'In sede', 2: 'Remoto' } }),
    modes: z.array(z.number().int()).meta({ optionLabels: { 1: 'In sede' } }),
  });
  const props = z
    .object({ properties: z.record(z.string(), z.record(z.string(), z.unknown())) })
    .parse(formSchema(schema)).properties;
  assert.deepEqual(
    {
      title: props.hours?.title,
      description: props.hours?.description,
      unit: props.hours?.unit,
      def: props.hours?.default,
    },
    { title: 'Ore', description: 'Quante ore', unit: 'ore', def: 4 },
  );
  assert.deepEqual(props.mode?.optionLabels, { 1: 'In sede', 2: 'Remoto' });
  assert.deepEqual(props.modes?.optionLabels, { 1: 'In sede' });
});
