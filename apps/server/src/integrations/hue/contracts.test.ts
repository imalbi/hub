import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hueCommandSchema, initialHueState, percentToRaw, rawToPercent } from './contracts.ts';

void test('percent and raw brightness meet at both ends and round trip for every percent', () => {
  assert.equal(percentToRaw(1), 1);
  assert.equal(percentToRaw(100), 254);
  assert.equal(rawToPercent(1), 1);
  assert.equal(rawToPercent(254), 100);
  for (let percent = 1; percent <= 100; percent++) assert.equal(rawToPercent(percentToRaw(percent)), percent);
});

void test('raw values outside the light range clamp instead of leaving 1..100', () => {
  assert.equal(rawToPercent(0), 1);
  assert.equal(rawToPercent(255), 100);
});

void test('commands accept power and an integer percent and refuse anything else', () => {
  assert.deepEqual(hueCommandSchema.parse({ type: 'setPower', on: false }), { type: 'setPower', on: false });
  assert.deepEqual(hueCommandSchema.parse({ type: 'setBrightness', percent: 40 }), {
    type: 'setBrightness',
    percent: 40,
  });
  for (const bad of [0, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY, '50', null]) {
    assert.equal(hueCommandSchema.safeParse({ type: 'setBrightness', percent: bad }).success, false, String(bad));
  }
  assert.equal(hueCommandSchema.safeParse({ type: 'setPower', on: 'yes' }).success, false);
  assert.equal(hueCommandSchema.safeParse({ type: 'setPower' }).success, false);
  assert.equal(hueCommandSchema.safeParse({ type: 'toggle' }).success, false);
});

void test('the starting state knows nothing and claims no capability', () => {
  assert.deepEqual(initialHueState, {
    availability: 'connecting',
    power: null,
    brightnessPercent: null,
    model: null,
    capabilities: { power: false, brightness: false },
  });
});
