import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { emptyConfig } from './core/config.ts';
import { buildServer } from './server.ts';

process.env.NODE_ENV = 'test';

const webRoot = mkdtempSync(join(tmpdir(), 'hub-web-'));
mkdirSync(join(webRoot, 'assets'));
writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>Hub app</title>');
writeFileSync(join(webRoot, 'assets', 'app.js'), 'console.log("app")');
const app = buildServer({ dbPath: ':memory:', webRoot });
after(() => app.close());

void test('the built app is served, with index.html for the client-side routes', async () => {
  for (const url of ['/', '/deck', '/desk', '/anything/else']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200, url);
    assert.match(res.body, /Hub app/, url);
  }
  const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
  assert.equal(asset.statusCode, 200);
  assert.match(asset.body, /console\.log/);
  for (const url of ['/', '/desk']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200, url);
    assert.equal(res.headers['x-frame-options'], 'DENY', url);
    assert.equal(res.headers['referrer-policy'], 'no-referrer', url);
    assert.equal(res.headers['x-content-type-options'], 'nosniff', url);
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin', url);
    assert.equal(res.headers['strict-transport-security'], undefined, url);
    const csp = res.headers['content-security-policy'] ?? '';
    assert.match(csp, /frame-ancestors 'none'/, url);
    assert.match(csp, /object-src 'none'/, url);
    assert.match(csp, /base-uri 'none'/, url);
    assert.match(csp, /script-src 'self'/, url);
    assert.doesNotMatch(csp, /unsafe-eval/, url);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/, url);
  }
});

void test('a missing file is a 404, not the app', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/assets/missing.js' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/deck' })).statusCode, 404);
});

void test('the API is not shadowed by the fallback', async () => {
  const known = await app.inject({ method: 'GET', url: '/trpc/health' });
  assert.equal(known.json().result.data.ok, true);
  const unknown = await app.inject({ method: 'GET', url: '/trpc/nope' });
  assert.equal(unknown.statusCode, 404);
  assert.doesNotMatch(unknown.body, /Hub app/);
  const missingCover = await app.inject({ method: 'GET', url: '/music/nope' });
  assert.equal(missingCover.statusCode, 404);
  assert.doesNotMatch(missingCover.body, /Hub app/);
  const disabledMcp = buildServer({
    dbPath: ':memory:',
    webRoot,
    config: { ...emptyConfig, mcp: { ...emptyConfig.mcp, enabled: false } },
  });
  try {
    const mcpOff = await disabledMcp.inject({ method: 'GET', url: '/mcp' });
    assert.equal(mcpOff.statusCode, 404);
    assert.doesNotMatch(mcpOff.body, /Hub app/);
  } finally {
    await disabledMcp.close();
  }
});

void test('without a web root nothing but the API answers', async () => {
  const bare = buildServer({ dbPath: ':memory:' });
  assert.equal((await bare.inject({ method: 'GET', url: '/deck' })).statusCode, 404);
  await bare.close();
});
