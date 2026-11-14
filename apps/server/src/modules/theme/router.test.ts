import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

const values = {
  mode: 'dark',
  colors: {
    background: '#101418',
    foreground: '#e0e3e8',
    surface: '#1c2024',
    surfaceRaised: '#262a2f',
    muted: '#31353a',
    mutedForeground: '#c0c7cd',
    border: '#ffffff1a',
    primary: '#e0e3e8',
    primaryForeground: '#101418',
    accent: '#8ecff2',
    success: '#7dd69a',
    danger: '#ffb4ab',
  },
};

function server() {
  return buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, config: emptyConfig });
}

async function call(app: ReturnType<typeof server>, path: string, input?: unknown) {
  const res =
    input === undefined
      ? await app.inject({ method: 'GET', url: `/trpc/${path}` })
      : await app.inject({
          method: 'POST',
          url: `/trpc/${path}`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify(input),
        });
  return { status: res.statusCode, body: res.json() };
}

void test('custom themes are saved, listed, renamed, updated and deleted', async () => {
  const app = server();
  const saved = await call(app, 'theme.save', { name: 'Notte', base: 'ink', values });
  assert.equal(saved.status, 200);
  const id = saved.body.result.data.id;

  assert.deepEqual((await call(app, 'theme.list')).body.result.data, [{ id, name: 'Notte', base: 'ink', values }]);

  assert.equal((await call(app, 'theme.rename', { id, name: 'Mezzanotte' })).status, 200);
  const brighter = { ...values, colors: { ...values.colors, accent: '#aaddff' } };
  assert.equal((await call(app, 'theme.save', { id, name: 'Mezzanotte', base: 'ink', values: brighter })).status, 200);
  const [row] = (await call(app, 'theme.list')).body.result.data;
  assert.equal(row.name, 'Mezzanotte');
  assert.equal(row.values.colors.accent, '#aaddff');

  assert.equal((await call(app, 'theme.delete', { id, confirmed: true })).status, 200);
  assert.deepEqual((await call(app, 'theme.list')).body.result.data, []);
  assert.equal((await call(app, 'theme.delete', { id, confirmed: true })).status, 404);
  await app.close();
});

void test('a theme saved before seeds existed still lists and saves; a seed and its manual roles round-trip', async () => {
  const app = server();
  const legacy = await call(app, 'theme.save', { name: 'Vecchio', base: 'ink', values });
  const id = legacy.body.result.data.id;
  const [old] = (await call(app, 'theme.list')).body.result.data;
  assert.equal(old.values.seed, undefined);
  assert.equal(old.values.manual, undefined);

  const seed = { baseHue: 330, baseChroma: 0.016, accentHue: 35, contrast: 70 };
  const seeded = { ...values, seed, manual: ['accent'] };
  assert.equal((await call(app, 'theme.save', { id, name: 'Vecchio', base: 'ink', values: seeded })).status, 200);
  const [row] = (await call(app, 'theme.list')).body.result.data;
  assert.deepEqual(row.values.seed, seed);
  assert.deepEqual(row.values.manual, ['accent']);

  for (const bad of [
    { ...seed, contrast: 101 },
    { ...seed, baseHue: -1 },
    { ...seed, accentHue: 361 },
    { ...seed, baseChroma: 0.5 },
  ])
    assert.equal(
      (await call(app, 'theme.save', { name: 'x', base: 'ink', values: { ...values, seed: bad } })).status,
      400,
    );
  assert.equal(
    (await call(app, 'theme.save', { name: 'x', base: 'ink', values: { ...values, manual: ['nonsense'] } })).status,
    400,
  );
  await app.close();
});

void test('only hex colors are accepted, so nothing else can reach the generated CSS', async () => {
  const app = server();
  for (const bad of ['red', '#fff', '#12345g', '#000000;}body{display:none', 'url(x)']) {
    const res = await call(app, 'theme.save', {
      name: 'x',
      base: 'ink',
      values: { ...values, colors: { ...values.colors, background: bad } },
    });
    assert.equal(res.status, 400, bad);
  }
  assert.equal((await call(app, 'theme.save', { name: '  ', base: 'ink', values })).status, 400);
  assert.equal(
    (await call(app, 'theme.save', { name: 'x', base: 'ink', values: { ...values, mode: 'sepia' } })).status,
    400,
  );
  await app.close();
});

void test('without a configured scheme the Caelestia theme is null', async () => {
  const app = server();
  assert.equal((await call(app, 'theme.caelestia')).body.result.data, null);
  await app.close();
});

void test('a LAN device without a token cannot read or change themes', async () => {
  const app = server();
  const res = await app.inject({ method: 'GET', url: '/trpc/theme.list', remoteAddress: '192.0.2.40' });
  assert.equal(res.statusCode, 401);
  await app.close();
});
