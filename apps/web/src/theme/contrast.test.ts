import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrast, contrastFailures, parseHex, type Colors } from './contrast.ts';

const readable: Colors = {
  background: '#070707',
  foreground: '#f2f2f2',
  surface: '#121212',
  surfaceRaised: '#1d1d1d',
  muted: '#262626',
  mutedForeground: '#989898',
  border: '#ffffff1a',
  primary: '#f2f2f2',
  primaryForeground: '#070707',
  accent: '#99c9c5',
  success: '#6ac48c',
  danger: '#ef6661',
};

void test('black on white is 21:1 and a color on itself is 1:1', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
});

void test('a translucent color is composited over its background first', () => {
  assert.equal(contrast('#ffffff00', '#000000'), 1);
  assert.ok(contrast('#ffffff80', '#000000') < contrast('#ffffff', '#000000'));
});

void test('only #rrggbb and #rrggbbaa parse', () => {
  assert.deepEqual(parseHex('#ff0000'), [1, 0, 0, 1]);
  assert.equal(parseHex('#fff'), null);
  assert.equal(parseHex('red'), null);
  assert.equal(parseHex('#ff0000;}'), null);
});

void test('the default dark theme passes every check', () => {
  assert.deepEqual(contrastFailures(readable), []);
});

void test('a muted text too close to its panel and a faint accent are both reported with their ratio', () => {
  const failures = contrastFailures({ ...readable, mutedForeground: '#333333', accent: '#222222' });
  assert.deepEqual(
    failures.map(({ text, on, min }) => [text, on, min]),
    [
      ['mutedForeground', 'surface', 4.5],
      ['accent', 'surface', 3],
    ],
  );
  assert.ok(failures.every(({ ratio, min }) => ratio < min));
});
