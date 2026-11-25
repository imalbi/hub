import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { callAgentAction } from './agent-action.ts';
import { createConfirmations } from './confirmations.ts';
import { createConfirmationsRouter } from './confirmations-router.ts';
import { openDb } from '../db/index.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { createDeviceSockets } from './auth.ts';
import { emptyConfig } from './config.ts';
import { streamSpawn } from './exec.ts';
import { createFiles } from './files.ts';
import { createJobRunner } from './jobs.ts';
import { loopbackProcedure, protectedProcedure, router, type Context } from './trpc.ts';

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

void test('a device cannot approve loopback actions; the PC can still approve the pending request', async (t) => {
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
  });
  const confirmations = createConfirmations();
  const unsubscribe = confirmations.subscribe(() => {});
  t.after(unsubscribe);
  let calls = 0;
  const app = router({
    danger: loopbackProcedure
      .meta({ label: 'Test', description: 'PC only', danger: true })
      .input(z.object({ confirmed: z.literal(true) }))
      .mutation(() => ++calls),
    allowed: protectedProcedure
      .meta({ label: 'Test', description: 'Paired devices allowed', danger: true })
      .input(z.object({ confirmed: z.literal(true) }))
      .mutation(() => ++calls),
    confirmations: createConfirmationsRouter(confirmations),
  });
  const context: Context = {
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    client: { kind: 'loopback' },
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  };
  const agent = { kind: 'agent', agentId: 0, name: 'Local agent' } satisfies Context['client'];
  const requested = await callAgentAction(app, confirmations, context, agent, 'danger');
  const { id } = z.object({ id: z.string() }).parse(requested.result);
  const phone = app.createCaller({
    ...context,
    client: { kind: 'device', deviceId: 1, expiresAt: Date.now() + 86_400_000 },
  });
  await assert.rejects(phone.confirmations.confirm({ id, confirmed: true }), { code: 'FORBIDDEN' });
  assert.equal(calls, 0);
  assert.deepEqual(confirmations.status(id, 0), { state: 'pending' });
  await app.createCaller(context).confirmations.confirm({ id, confirmed: true });
  assert.equal(calls, 1);
  const allowed = await callAgentAction(app, confirmations, context, agent, 'allowed');
  await phone.confirmations.confirm({ id: z.object({ id: z.string() }).parse(allowed.result).id, confirmed: true });
  assert.equal(calls, 2);
  const expired = app.createCaller({
    ...context,
    client: { kind: 'device', deviceId: 1, expiresAt: Date.now() },
  });
  await assert.rejects(expired.allowed({ confirmed: true }), { code: 'UNAUTHORIZED' });
  assert.equal(calls, 2);
});
