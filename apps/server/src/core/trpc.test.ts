import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { openDb } from '../db/index.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { createDeviceSockets } from './auth.ts';
import { emptyConfig } from './config.ts';
import { streamSpawn } from './exec.ts';
import { createFiles } from './files.ts';
import { createJobRunner } from './jobs.ts';
import { protectedProcedure, router } from './trpc.ts';

void test('an agent cannot confirm a dangerous action even with confirmed true', async (t) => {
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
  });
  let called = false;
  const app = router({
    danger: protectedProcedure
      .meta({ label: 'Danger', description: 'A dangerous action', danger: true })
      .input(z.object({ confirmed: z.literal(true) }))
      .mutation(() => {
        called = true;
      }),
  });
  const caller = app.createCaller({
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    client: { kind: 'agent', agentId: 1, name: 'Test' },
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  });
  await assert.rejects(caller.danger({ confirmed: true }));
  assert.equal(called, false);
});
