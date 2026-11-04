import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createCaelestiaTheme, parseCaelestiaScheme } from './caelestia.ts';

const fixture = readFileSync(new URL('./fixtures/scheme.json', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'hub-caelestia-'));
after(() => rmSync(dir, { recursive: true, force: true }));

void test('Caelestia roles map onto the theme roles, buttons neutral and the key color as accent', () => {
  const theme = parseCaelestiaScheme(fixture);
  assert.ok(theme);
  assert.equal(theme.mode, 'dark');
  assert.deepEqual(
    {
      background: theme.colors.background,
      foreground: theme.colors.foreground,
      surface: theme.colors.surface,
      primary: theme.colors.primary,
      primaryForeground: theme.colors.primaryForeground,
      accent: theme.colors.accent,
      danger: theme.colors.danger,
    },
    {
      background: '#101418',
      foreground: '#e0e3e8',
      surface: '#1c2024',
      primary: '#e0e3e8',
      primaryForeground: '#101418',
      accent: '#8ecff2',
      danger: '#ffb4ab',
    },
  );
});

void test('a missing or malformed role falls back to the fixed theme of the same mode', () => {
  const scheme = JSON.parse(fixture);
  delete scheme.colours.onSurfaceVariant;
  scheme.colours.primary = 'not a color';
  const theme = parseCaelestiaScheme(JSON.stringify(scheme));
  assert.equal(theme?.colors.mutedForeground, '#989898');
  assert.equal(theme?.colors.accent, '#99c9c5');

  const light = parseCaelestiaScheme(JSON.stringify({ mode: 'light', colours: {} }));
  assert.equal(light?.colors.background, '#ebebe9');
});

void test('text that is not a scheme is null, never a half theme', () => {
  assert.equal(parseCaelestiaScheme('{'), null);
  assert.equal(parseCaelestiaScheme('{"mode":"sepia","colours":{}}'), null);
  // Nothing outside six hex digits survives, so a value cannot break out of a CSS declaration.
  const hostile = parseCaelestiaScheme(JSON.stringify({ mode: 'dark', colours: { background: 'red;}body{x:1' } }));
  assert.equal(hostile?.colors.background, '#070707');
});

void test('the live theme keeps the last good scheme while the file is broken, and follows a rewrite', async () => {
  const path = join(dir, 'scheme.json');
  writeFileSync(path, fixture);
  const live = createCaelestiaTheme(path);
  assert.equal((await live.read())?.colors.background, '#101418');

  writeFileSync(path, '{"mode":');
  assert.equal((await live.read())?.colors.background, '#101418');

  writeFileSync(path, JSON.stringify({ mode: 'light', colours: { background: 'F4F4F4' } }));
  const next = await live.read();
  assert.equal(next?.mode, 'light');
  assert.equal(next?.colors.background, '#f4f4f4');
});

void test('without a path, or with a missing file, there is no Caelestia theme', async () => {
  assert.equal(await createCaelestiaTheme(undefined).read(), null);
  assert.equal(await createCaelestiaTheme(join(dir, 'missing.json')).read(), null);
});
