import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrastFailures } from './contrast.ts';
import { deriveColors, defaultSeed } from './derive.ts';
import { colorsOf, editorStateOf, roles, valuesOf } from './editor-state.ts';

const derived = deriveColors('dark', defaultSeed);
const seeded = {
  mode: 'dark' as const,
  colors: { ...derived, border: `${derived.foreground}1a` },
  seed: defaultSeed,
  manual: [],
};

void test('a theme with no seed opens with every role by hand and round-trips unchanged', () => {
  const legacy = { mode: 'dark' as const, colors: { ...derived, accent: '#ff8800' } };
  const state = editorStateOf(legacy);
  assert.deepEqual(Object.keys(state.manual).toSorted(), roles.toSorted());
  assert.deepEqual(colorsOf(state), legacy.colors);
});

void test('a seeded theme starts with no manual role, and changing the seed moves every derived role', () => {
  const state = editorStateOf(seeded);
  assert.deepEqual(valuesOf(state).manual, []);
  const moved = colorsOf({ ...state, seed: { ...state.seed, baseHue: 330, baseChroma: 0.02, accentHue: 35 } });
  assert.notEqual(moved.surface, derived.surface);
  assert.notEqual(moved.accent, derived.accent);
});

void test('a role set by hand survives seed changes, is listed as manual and is released by deleting it', () => {
  const state = editorStateOf(seeded);
  const byHand = { ...state, manual: { accent: '#ff8800' } };
  const changed = colorsOf({ ...byHand, seed: { ...byHand.seed, accentHue: 35, baseHue: 80 } });
  assert.equal(changed.accent, '#ff8800');
  assert.deepEqual(valuesOf(byHand).manual, ['accent']);
  assert.equal(colorsOf({ ...byHand, manual: {} }).accent, derived.accent);
  assert.deepEqual(editorStateOf(valuesOf(byHand)).manual, { accent: '#ff8800' });
});

void test('the hairline follows a manual text color, and manual roles are covered by the contrast checks', () => {
  const state = editorStateOf(seeded);
  const dim = { ...state, manual: { foreground: '#202020' } };
  assert.equal(colorsOf(dim).border, '#2020201a');
  const failures = contrastFailures(colorsOf(dim));
  assert.ok(failures.some(({ text, on }) => text === 'foreground' && on === 'background'));
});
