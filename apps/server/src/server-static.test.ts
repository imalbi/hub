import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
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
});

void test('without a web root nothing but the API answers', async () => {
  const bare = buildServer({ dbPath: ':memory:' });
  assert.equal((await bare.inject({ method: 'GET', url: '/deck' })).statusCode, 404);
  await bare.close();
});
