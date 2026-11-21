import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_ORIGINS, allowedHostnames, allowedOrigins, deckUrl, isAllowedHost, isAllowedOrigin } from './origin.ts';

const allowlist = ['http://localhost:5173', 'https://hub.example'];

void test('isAllowedOrigin accepts an origin on the allowlist', () => {
  assert.equal(isAllowedOrigin('https://hub.example', allowlist), true);
});

void test('isAllowedOrigin rejects an origin that is not on the allowlist', () => {
  assert.equal(isAllowedOrigin('https://evil.example', allowlist), false);
  // Same host on another port is another origin.
  assert.equal(isAllowedOrigin('http://localhost:5174', allowlist), false);
});

void test('isAllowedOrigin rejects a missing Origin header', () => {
  assert.equal(isAllowedOrigin(undefined, allowlist), false);
  assert.equal(isAllowedOrigin('', allowlist), false);
});

void test('isAllowedOrigin ignores a trailing slash and letter case', () => {
  assert.equal(isAllowedOrigin('https://hub.example/', allowlist), true);
  assert.equal(isAllowedOrigin('HTTPS://Hub.Example', allowlist), true);
  assert.equal(isAllowedOrigin('https://hub.example', ['https://HUB.example/']), true);
});

void test('isAllowedOrigin bounds length and strips trailing slashes linearly', () => {
  const started = performance.now();
  assert.equal(isAllowedOrigin(`${'/'.repeat(16000)}x`, allowlist), false);
  assert.ok(performance.now() - started < 5);
  assert.equal(isAllowedOrigin(`https://${'a'.repeat(249)}`, allowlist), false);
  assert.equal(isAllowedOrigin('http://localhost:4180/', DEV_ORIGINS), true);
});

void test('isAllowedOrigin rejects everything against an empty allowlist', () => {
  assert.equal(isAllowedOrigin('https://hub.example', []), false);
});

void test('allowedOrigins merges the configured origins with the dev origins', () => {
  const merged = allowedOrigins({ server: { host: '127.0.0.1', allowedOrigins: ['https://hub.example'] } });
  assert.deepEqual(merged, [...DEV_ORIGINS, 'https://hub.example']);
});

void test('isAllowedHost accepts loopback and configured hosts and rejects foreign or malformed values', () => {
  const allowed = ['http://hub.example:4180', 'https://[2001:db8::10]:4180'];
  assert.deepEqual(
    allowedHostnames(allowed),
    new Set(['localhost', '127.0.0.1', '[::1]', 'hub.example', '[2001:db8::10]']),
  );
  for (const valid of [
    '127.0.0.1:4180',
    'localhost:4180',
    'LOCALHOST',
    '[::1]:4180',
    'hub.example:4180',
    '[2001:db8::10]',
  ])
    assert.equal(isAllowedHost(valid, allowed), true, valid);
  for (const bad of [
    undefined,
    '',
    ['localhost:4180'],
    'rebind.example:4180',
    'evil@localhost:4180',
    'localhost:4180, evil.example',
    '0x7f000001:4180',
    '2130706433',
    '127.1:4180',
    'localhost:99999',
    'a'.repeat(257),
  ])
    assert.equal(isAllowedHost(bad, allowed), false, String(bad));
});

const withOrigins = (origins: string[]) => ({ server: { host: '0.0.0.0', allowedOrigins: origins } });

void test('deckUrl is the deck on the first LAN origin, skipping loopback ones', () => {
  const config = withOrigins(['http://localhost:4180', 'http://127.0.0.1:4180', 'http://hub.example.test:4180/']);
  assert.equal(deckUrl(config), 'http://hub.example.test:4180/deck');
});

void test('deckUrl is null with no origin or only loopback and unparsable ones', () => {
  assert.equal(deckUrl(withOrigins([])), null);
  assert.equal(deckUrl(withOrigins(['http://localhost:5173', 'http://[::1]:4180', 'not a url'])), null);
});
