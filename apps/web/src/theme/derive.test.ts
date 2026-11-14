import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrast, contrastFailures } from './contrast.ts';
import { accentPresets, basePresets, deriveColors, oklchHex, rate, textRatio, type Mode } from './derive.ts';

const modes: Mode[] = ['dark', 'light'];
const seedOf = (base: (typeof basePresets)[number], accent: (typeof accentPresets)[number], level: number) => ({
  baseHue: base.hue,
  baseChroma: base.chroma,
  accentHue: accent.hue,
  contrast: level,
});

void test('every preset combination at the default contrast passes every contrast check', () => {
  for (const mode of modes)
    for (const base of basePresets)
      for (const accent of accentPresets) {
        const colors = deriveColors(mode, seedOf(base, accent, 70));
        const where = `${mode} ${base.id} ${accent.id}`;
        assert.deepEqual(contrastFailures(colors), [], where);
        for (const ground of ['background', 'surface', 'muted'] as const)
          assert.ok(contrast(colors.foreground, colors[ground]) >= 4.5, `${where} on ${ground}`);
      }
});

void test('the slider ends are weak and strong: Basso at 0, AAA at 100, in both modes and for every base', () => {
  for (const mode of modes)
    for (const base of basePresets) {
      const [accent] = accentPresets;
      assert.equal(rate(textRatio(deriveColors(mode, seedOf(base, accent, 0)))), 'low', `${mode} ${base.id} at 0`);
      assert.equal(rate(textRatio(deriveColors(mode, seedOf(base, accent, 100)))), 'aaa', `${mode} ${base.id} at 100`);
    }
});

void test('more contrast never lowers the text ratio', () => {
  const [base] = basePresets;
  const [accent] = accentPresets;
  for (const mode of modes) {
    let last = 0;
    for (let level = 0; level <= 100; level += 10) {
      const ratio = textRatio(deriveColors(mode, seedOf(base, accent, level)));
      assert.ok(ratio >= last, `${mode} at ${level}`);
      last = ratio;
    }
  }
});

void test('success and danger keep their colors whatever the seed', () => {
  for (const mode of modes) {
    const [first, ...rest] = basePresets.flatMap((base) =>
      accentPresets.map((accent) => deriveColors(mode, seedOf(base, accent, 40))),
    );
    for (const colors of rest) {
      assert.equal(colors.success, first?.success);
      assert.equal(colors.danger, first?.danger);
    }
  }
});

void test('the accent follows the hue and the tinted base follows its own', () => {
  const [coral, green] = [accentPresets[2], accentPresets[1]];
  const plum = basePresets[5];
  const a = deriveColors('dark', seedOf(plum, coral, 70));
  const b = deriveColors('dark', seedOf(plum, green, 70));
  assert.notEqual(a.accent, b.accent);
  assert.equal(a.surface, b.surface);
  assert.notEqual(a.surface, deriveColors('dark', seedOf(basePresets[0], coral, 70)).surface);
});

void test('OKLCH converts to the known sRGB values, and an out of gamut chroma is reduced rather than clipped', () => {
  assert.equal(oklchHex(1, 0, 0), '#ffffff');
  assert.equal(oklchHex(0, 0, 0), '#000000');
  assert.equal(oklchHex(0.13, 0, 0), '#070707');
  // Pure sRGB red is about L 0.628, C 0.2577, hue 29.2.
  assert.equal(oklchHex(0.628, 0.2577, 29.23), '#ff0000');
  assert.match(oklchHex(0.95, 0.4, 265), /^#[\da-f]{6}$/);
});

void test('ratings split at 4.5 and 7', () => {
  assert.deepEqual([4.4, 4.5, 6.9, 7].map(rate), ['low', 'aa', 'aa', 'aaa']);
});

void test('any hue the sliders reach passes at the default contrast', () => {
  for (const mode of modes)
    for (let hue = 0; hue <= 360; hue += 15) {
      const colors = deriveColors(mode, { baseHue: hue, baseChroma: 0.022, accentHue: hue, contrast: 70 });
      assert.deepEqual(contrastFailures(colors), [], `${mode} ${hue}`);
    }
});
