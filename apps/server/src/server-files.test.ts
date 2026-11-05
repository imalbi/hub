import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { buildServer } from './server.ts';
import { emptyConfig } from './core/config.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';
const metadata = z.object({ fileId: z.string(), name: z.string(), mime: z.string() });
function upload(content: string) {
  return {
    method: 'POST' as const,
    url: '/files',
    headers: { 'content-type': 'multipart/form-data; boundary=hub-file' },
    payload: `--hub-file\r\nContent-Disposition: form-data; name="file"; filename="example.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--hub-file--\r\n`,
  };
}
void test('file upload/download is protected, bounded and round trips through the example action', async (t) => {
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    moduleRoots: [],
    exampleModules: true,
    config: { ...emptyConfig, files: { maxUploadMb: 0.001 } },
  });
  t.after(() => app.close());
  assert.equal((await app.inject({ ...upload('hello'), remoteAddress: '192.0.2.2' })).statusCode, 401);
  assert.equal((await app.inject(upload('x'.repeat(2000)))).statusCode, 413);
  const response = await app.inject(upload('hello'));
  assert.equal(response.statusCode, 200);
  const file = metadata.parse(response.json());
  assert.equal((await app.inject({ url: `/files/${file.fileId}`, remoteAddress: '192.0.2.2' })).statusCode, 401);
  const acted = await app.inject({
    method: 'POST',
    url: '/trpc/hello.copyFile',
    headers: { 'content-type': 'application/json' },
    payload: { fileId: file.fileId },
  });
  assert.equal(acted.statusCode, 200);
  const result = z.object({ result: z.object({ data: metadata }) }).parse(acted.json()).result.data;
  const downloaded = await app.inject(`/files/${result.fileId}`);
  assert.equal(downloaded.statusCode, 200);
  assert.equal(downloaded.body, 'hello');
  assert.match(downloaded.headers['content-disposition'] ?? '', /^attachment;/);
  assert.equal((await app.inject('/files/not-a-file-id')).statusCode, 404);
});

void test('a page on another origin cannot upload or download through the PC, the hub page can', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, moduleRoots: [] });
  t.after(() => app.close());
  // A multipart POST is a CORS "simple request": any site open in the PC's browser sends it from loopback, unpreflighted.
  const foreign = { origin: 'https://attacker.example' };
  const refused = await app.inject({ ...upload('hello'), headers: { ...upload('hello').headers, ...foreign } });
  assert.equal(refused.statusCode, 403);
  const allowed = await app.inject({
    ...upload('hello'),
    headers: { ...upload('hello').headers, origin: 'http://127.0.0.1:4180' },
  });
  assert.equal(allowed.statusCode, 200);
  const file = metadata.parse(allowed.json());
  assert.equal((await app.inject({ url: `/files/${file.fileId}`, headers: foreign })).statusCode, 403);
});
