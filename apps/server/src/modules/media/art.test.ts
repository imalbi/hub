import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Run } from '../../core/exec.ts';
import { createMediaArt } from './art.ts';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const offlineFetch: typeof fetch = () => Promise.reject(new Error('offline'));
const declared: typeof fetch = () =>
  Promise.resolve(new Response(png, { headers: { 'content-length': String(3 * 1024 * 1024) } }));
function metadata(url: string): Run {
  return () => Promise.resolve({ stdout: `Playing\tArtist\tTitle\t${url}\t120000000\n`, stderr: '', code: 0 });
}

void test('current file artwork is detected from bytes and caches only the last key', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-art-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'cover.data');
  await writeFile(file, png);
  const read = createMediaArt(metadata(pathToFileURL(file).href));
  const result = await read();
  assert.equal(result?.dataUrl, `data:image/png;base64,${png.toString('base64')}`);
  assert.match(result?.key ?? '', /^[a-f0-9]{16}$/);
  await rm(file);
  assert.deepEqual(await read(), result);
});

void test('local files obey the same image and size limits as remote artwork', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-art-limits-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'not-a-cover.png');
  for (const bytes of [Buffer.from('<html>not an image</html>'), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    await writeFile(file, bytes);
    assert.equal(await createMediaArt(metadata(pathToFileURL(file).href))(), null);
  }
});

void test('a disposable FIFO is rejected without blocking an artwork request', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-art-fifo-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'cover.pipe');
  execFileSync('mkfifo', [file]);
  const code = `
    import { createMediaArt } from ${JSON.stringify(new URL('./art.ts', import.meta.url).href)};
    const run = () => Promise.resolve({ stdout: ${JSON.stringify(`Playing\tArtist\tTitle\t${pathToFileURL(file).href}\t60000000\n`)}, stderr: '', code: 0 });
    process.stdout.write(JSON.stringify(await createMediaArt(run)()));
  `;
  // A child gives this regression a hard deadline even if opening a FIFO blocks a filesystem worker.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 3000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'null');
});

void test('https artwork uses bounded fetch, byte type detection and changes with the current track', async () => {
  let url = 'https://example.com/a';
  const requested: string[] = [];
  const fakeFetch: typeof fetch = (input, options) => {
    requested.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.ok(options?.signal);
    assert.equal(options?.redirect, 'error');
    return Promise.resolve(new Response(png, { headers: { 'content-type': 'text/plain' } }));
  };
  const run: Run = (bin, args, options) => metadata(url)(bin, args, options);
  const read = createMediaArt(run, { fetch: fakeFetch });
  const first = await read();
  assert.equal(first?.dataUrl.startsWith('data:image/png;base64,'), true);
  await read();
  assert.deepEqual(requested, ['https://example.com/a']);
  url = 'https://example.com/b';
  const second = await read();
  assert.notEqual(second?.key, first?.key);
  assert.deepEqual(requested, ['https://example.com/a', 'https://example.com/b']);
});

void test('missing files, unsupported schemes and failed fetches return null', async () => {
  for (const url of [
    '',
    'file:///nonexistent-hub-fixture.png',
    'http://example.com/art',
    'data:image/png;base64,AA==',
    'https://example.com/offline',
  ]) {
    assert.equal(await createMediaArt(metadata(url), { fetch: offlineFetch })(), null);
  }
});

void test('non-images and oversized streamed or declared images return null', async () => {
  const bodies = [Buffer.from('<svg>untrusted</svg>'), Buffer.alloc(2 * 1024 * 1024 + 1)];
  for (const body of bodies) {
    const fakeFetch: typeof fetch = () => Promise.resolve(new Response(body));
    assert.equal(await createMediaArt(metadata('https://example.com/art'), { fetch: fakeFetch })(), null);
  }

  assert.equal(await createMediaArt(metadata('https://example.com/art'), { fetch: declared })(), null);
});

void test('JPEG and WebP are detected by signatures, never an advertised MIME or filename', async () => {
  const examples: [Buffer, string][] = [
    [Buffer.from('ffd8ffe000104a464946', 'hex'), 'image/jpeg'],
    [Buffer.from('52494646240000005745425056503820', 'hex'), 'image/webp'],
  ];
  for (const [bytes, mime] of examples) {
    const fakeFetch: typeof fetch = () => Promise.resolve(new Response(bytes));
    const result = await createMediaArt(metadata('https://example.com/art'), { fetch: fakeFetch })();
    assert.ok(result?.dataUrl.startsWith(`data:${mime};base64,`));
  }
});
