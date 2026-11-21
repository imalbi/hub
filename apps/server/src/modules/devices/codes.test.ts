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

void test('ten wrong attempts across distinct addresses burn the active code', () => {
  const codes = createPairingCodes();
  const { code } = codes.create();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 10; i++) assert.equal(codes.redeem(`192.0.2.${i}`, wrong), 'wrong');
  assert.equal(codes.redeem('192.0.2.99', code), 'wrong');
});

void test('IPv6 hosts share a /64 rate-limit bucket and IPv4-mapped IPv6 shares its IPv4 bucket', () => {
  const codes = createPairingCodes();
  const { code } = codes.create();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 5; i++) assert.equal(codes.redeem(`2001:db8:1:2::${i}`, wrong), 'wrong');
  assert.equal(codes.redeem('2001:db8:1:2::6', code), 'limited');
  assert.equal(codes.redeem('2001:db8:1:3::1', wrong), 'wrong');

  for (let i = 0; i < 5; i++) assert.equal(codes.redeem('::ffff:192.0.2.50', wrong), 'wrong');
  assert.equal(codes.redeem('192.0.2.50', code), 'limited');
});
