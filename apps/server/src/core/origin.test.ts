import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEV_ORIGINS, allowedOrigins, deckUrl, isAllowedOrigin } from './origin.ts';

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

void test('isAllowedOrigin rejects everything against an empty allowlist', () => {
  assert.equal(isAllowedOrigin('https://hub.example', []), false);
});

void test('allowedOrigins merges the configured origins with the dev origins', () => {
  const merged = allowedOrigins({ server: { host: '127.0.0.1', allowedOrigins: ['https://hub.example'] } });
  assert.deepEqual(merged, [...DEV_ORIGINS, 'https://hub.example']);
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
