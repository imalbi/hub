import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { mock, test } from 'node:test';
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
