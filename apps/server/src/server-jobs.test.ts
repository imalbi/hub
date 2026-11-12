import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db/index.ts';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';
import { jobProcedure, router } from './core/trpc.ts';

process.env.NODE_ENV = 'test';

void test('jobs are protected and cancellation requires confirmation', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const list = await app.inject('/trpc/jobs.list');
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json().result.data, []);
  const cancel = await app.inject({ method: 'POST', url: '/trpc/jobs.cancel', payload: { jobId: 'missing' } });
  assert.equal(cancel.statusCode, 412);
  const remote = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, isLoopback: () => false });
  t.after(() => remote.close());
  assert.equal((await remote.inject('/trpc/jobs.list')).statusCode, 401);
});

void test('a declared job action returns an id before its first output', async (t) => {
  let emit: ((text: string, stream: 'stdout' | 'stderr') => void) | undefined;
  const app = buildServer({
    dbPath: ':memory:',
    deps: {
      run: createFakeDesktop(),
      testRouters: {
        fakeJob: router({
          start: jobProcedure
            .meta({ label: 'Job fittizio', description: 'Start a fake job', job: true })
            .mutation(({ ctx }) => ctx.startJob('fake-job', [])),
        }),
      },
      spawn: (_bin, _args, line) => {
        emit = line;
        return { kill() {} };
      },
    },
  });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/trpc/fakeJob.start', payload: {} });
  assert.equal(response.statusCode, 200);
  const id: string = response.json().result.data.jobId;
  assert.ok(id);
  const before = await app.inject(`/trpc/jobs.output?input=${encodeURIComponent(JSON.stringify({ jobId: id }))}`);
  assert.deepEqual(before.json().result.data, []);
  emit?.('first', 'stdout');
  const after = await app.inject(`/trpc/jobs.output?input=${encodeURIComponent(JSON.stringify({ jobId: id }))}`);
  assert.equal(after.json().result.data[0].message, 'first');
});

void test('server shutdown kills and persists a running job as cancelled', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-jobs-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'core.db');
  let killed = false;
  const app = buildServer({
    dbPath,
    deps: {
      run: createFakeDesktop(),
      spawn: () => ({
        kill: () => {
          killed = true;
        },
      }),
      testRouters: {
        fakeJob: router({
          start: jobProcedure
            .meta({ label: 'Job fittizio', description: 'Start a fake job', job: true })
            .mutation(({ ctx }) => ctx.startJob('fake-job', [])),
        }),
      },
    },
  });
  const response = await app.inject({ method: 'POST', url: '/trpc/fakeJob.start', payload: {} });
  const id: string = response.json().result.data.jobId;
  await app.close();
  assert.equal(killed, true);
  const db = openDb(dbPath);
  t.after(() => db.$client.close());
  assert.equal(db.$client.prepare('SELECT status FROM jobs WHERE id = ?').get(id)?.status, 'cancelled');
});
