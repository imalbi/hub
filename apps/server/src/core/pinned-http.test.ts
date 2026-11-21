import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { PinnedHttpError, pinnedRequest } from './pinned-http.ts';

void test('pinnedRequest connects strictly to target IP without resolving the URL hostname', async (t) => {
  const seenHosts: Array<string | undefined> = [];
  const server = http.createServer((req, res) => {
    seenHosts.push(req.headers.host);
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await pinnedRequest(new URL(`http://unresolvable.invalid:${address.port}/job`), {
    address: '127.0.0.1',
    family: 4,
  });
  assert.equal(response.status, 200);
  assert.equal(response.text, 'ok');
  assert.deepEqual(seenHosts, [`unresolvable.invalid:${address.port}`]);
});

void test('pinnedRequest aborts streaming when body exceeds maxBytes', async (t) => {
  let chunksSent = 0;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    for (let i = 0; i < 16; i++) {
      chunksSent++;
      res.write('x'.repeat(256));
    }
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await assert.rejects(
    pinnedRequest(
      new URL(`http://example.invalid:${address.port}/big`),
      { address: '127.0.0.1', family: 4 },
      { maxBytes: 512 },
    ),
    (error: unknown) => error instanceof PinnedHttpError && error.code === 'PAYLOAD_TOO_LARGE',
  );
  assert.ok(chunksSent >= 1);
});
