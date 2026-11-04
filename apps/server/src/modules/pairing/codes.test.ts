import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { createPairingCodes } from './codes.ts';

afterEach(() => mock.timers.reset());

const ADDRESS = '192.0.2.20';

void test('a code is six digits and redeems once', () => {
  const codes = createPairingCodes();
  const { code } = codes.create();
  assert.match(code, /^\d{6}$/);
  assert.equal(codes.redeem(ADDRESS, code), 'ok');
  assert.equal(codes.redeem(ADDRESS, code), 'wrong');
});

void test('a code expires after 120 seconds', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const codes = createPairingCodes();
  const { code, expiresAt } = codes.create();
  assert.equal(expiresAt, 120_000);
  mock.timers.tick(119_999);
  assert.equal(codes.redeem(ADDRESS, code), 'ok');
  const second = codes.create().code;
  mock.timers.tick(120_000);
  assert.equal(codes.redeem(ADDRESS, second), 'wrong');
});

void test('a new code replaces the old one', () => {
  const codes = createPairingCodes();
  const first = codes.create().code;
  let second = codes.create().code;
  while (second === first) second = codes.create().code;
  assert.equal(codes.redeem(ADDRESS, first), 'wrong');
  assert.equal(codes.redeem(ADDRESS, second), 'ok');
});

void test('without an active code every attempt is wrong', () => {
  assert.equal(createPairingCodes().redeem(ADDRESS, '000000'), 'wrong');
});

void test('five failures lock the address out for the rest of the minute, even for the right code', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const codes = createPairingCodes();
  const { code } = codes.create();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal(codes.redeem(ADDRESS, wrong), 'wrong');
  assert.equal(codes.redeem(ADDRESS, code), 'limited');
  // Another address is not affected.
  assert.equal(codes.redeem('192.0.2.21', wrong), 'wrong');
  mock.timers.tick(60_000);
  assert.equal(codes.redeem(ADDRESS, code), 'ok');
});
