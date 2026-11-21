import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { mock, test } from 'node:test';
import { TRPCError } from '@trpc/server';
import { createFiles } from './files.ts';

void test('opaque file ids expire after an hour and shutdown removes remaining files', async (t) => {
  const files = createFiles();
  t.after(() => files.close());
  const first = await files.put(Buffer.from('first'), { name: 'example.txt', mime: 'text/plain' });
  const stored = await files.get(first.fileId);
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.after(() => mock.timers.reset());
  mock.timers.tick(60 * 60 * 1000);
  await assert.rejects(files.get(first.fileId), /expired/);
  await assert.rejects(access(stored.path));
  await assert.rejects(files.get('../../other-file'), /not found/);
  const second = await files.put(Buffer.from('second'), { name: 'example.txt', mime: 'text/plain' });
  const path = (await files.get(second.fileId)).path;
  await files.close();
  await assert.rejects(access(path));
});

void test('entry quota rejects a 51st upload and recovers after expiry', async (t) => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  t.after(() => mock.timers.reset());
  const files = createFiles();
  t.after(() => files.close());
  for (let i = 0; i < 50; i++) {
    await files.put(Buffer.from(`f${i}`), { name: `f${i}.txt`, mime: 'text/plain' });
  }
  await assert.rejects(
    files.put(Buffer.from('overflow'), { name: 'overflow.txt', mime: 'text/plain' }),
    (error: unknown) => error instanceof TRPCError && error.code === 'PAYLOAD_TOO_LARGE',
  );
  mock.timers.tick(60 * 60 * 1000);
  const afterExpiry = await files.put(Buffer.from('ok'), { name: 'ok.txt', mime: 'text/plain' });
  assert.equal(afterExpiry.name, 'ok.txt');
});

void test('byte quota rejects uploads exceeding the total cap', async (t) => {
  const files = createFiles({ maxTotalBytes: 10 });
  t.after(() => files.close());
  await files.put(Buffer.from('123456'), { name: 'a.txt', mime: 'text/plain' });
  await assert.rejects(
    files.put(Buffer.from('12345'), { name: 'b.txt', mime: 'text/plain' }),
    (error: unknown) => error instanceof TRPCError && error.code === 'PAYLOAD_TOO_LARGE',
  );
  const fits = await files.put(Buffer.from('1234'), { name: 'c.txt', mime: 'text/plain' });
  assert.equal(fits.name, 'c.txt');
});
