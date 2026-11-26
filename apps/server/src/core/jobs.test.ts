import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { openDb } from '../db/index.ts';
import { createJobRunner } from './jobs.ts';
import type { StreamSpawn } from './exec.ts';

function setup(maxConcurrent = 2) {
  const db = openDb(':memory:');
  const processes: {
    line: (line: string, stream: 'stdout' | 'stderr') => void;
    end: (code: number | null) => void;
    killed: boolean;
  }[] = [];
  const spawn: StreamSpawn = (_bin, _args, line, end) => {
    const process = { line, end, killed: false };
    processes.push(process);
    return {
      kill: () => {
        process.killed = true;
        end(null);
      },
    };
  };
  const runner = createJobRunner(db, spawn, maxConcurrent);
  return { db, runner, processes };
}

void test('starts immediately, queues over the cap, and keeps the last 500 output lines', () => {
  const { db, runner, processes } = setup();
  const first = runner.start('fake.first', 'fake', []);
  runner.start('fake.second', 'fake', []);
  const third = runner.start('fake.third', 'fake', []);
  assert.equal(processes.length, 2);
  assert.equal(runner.list().find((job) => job.id === third)?.status, 'queued');
  const process = processes[0];
  assert.ok(process);
  for (let i = 0; i < 600; i++) process.line(String(i), 'stdout');
  assert.equal(runner.output(first).length, 500);
  assert.equal(runner.output(first, 10)[0]?.message, '590');
  process.end(0);
  assert.equal(processes.length, 3);
  runner.close();
  db.$client.close();
});

void test('timeout and cancellation kill the process and persist their status', async () => {
  const { db, runner, processes } = setup();
  const timed = runner.start('fake.timeout', 'fake', [], 10);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(runner.list().find((job) => job.id === timed)?.status, 'timeout');
  assert.equal(processes[0]?.killed, true);
  const cancelled = runner.start('fake.cancel', 'fake', []);
  runner.cancel(cancelled);
  assert.equal(runner.list().find((job) => job.id === cancelled)?.status, 'cancelled');
  const closing = runner.start('fake.close', 'fake', []);
  runner.close();
  assert.equal(runner.list().find((job) => job.id === closing)?.status, 'cancelled');
  db.$client.close();
});

void test('streams every line in order and prunes completed history to 100', async () => {
  const { db, runner, processes } = setup();
  const id = runner.start('fake.stream', 'fake', []);
  const controller = new AbortController();
  const subscription = runner.lines(id, controller.signal);
  const received: string[] = [];
  const read = (async () => {
    for (let i = 0; i < 600; i++) {
      const next = await subscription.next();
      assert.equal(next.done, false);
      if (next.value) received.push(next.value.message);
    }
  })();
  for (let i = 0; i < 600; i++) processes[0]?.line(String(i), 'stdout');
  await read;
  assert.deepEqual(
    received,
    Array.from({ length: 600 }, (_, i) => String(i)),
  );
  await subscription.return(undefined);
  processes[0]?.end(0);
  for (let i = 0; i < 105; i++) {
    runner.start('fake.history', 'fake', []);
    processes.at(-1)?.end(0);
  }
  assert.equal(runner.list().length, 100);
  const count = db.$client.prepare('SELECT count(*) AS count FROM jobs').get();
  assert.equal(count?.count, 100);
  runner.close();
  db.$client.close();
});

void test('subscribers see a job added to the queue', async () => {
  const { db, runner } = setup(1);
  runner.start('fake.running', 'fake', []);
  const changes = runner.updates();
  await changes.next();
  const next = changes.next();
  const id = runner.start('fake.queued', 'fake', []);
  const result = await next;
  assert.equal(result.value?.find((job) => job.id === id)?.status, 'queued');
  await changes.return(undefined);
  runner.close();
  db.$client.close();
});

void test('a synchronous spawn failure records failure and lets the next job run', () => {
  const db = openDb(':memory:');
  let calls = 0;
  const spawn: StreamSpawn = () => {
    calls++;
    if (calls === 1) throw new Error('spawn failed');
    return { kill() {} };
  };
  const runner = createJobRunner(db, spawn, 1);
  const failed = runner.start('fake.failed', 'fake', []);
  const next = runner.start('fake.next', 'fake', []);
  assert.equal(runner.list().find((job) => job.id === failed)?.status, 'failed');
  assert.equal(runner.list().find((job) => job.id === next)?.status, 'running');
  runner.close();
  db.$client.close();
});

void test('the job list carries no output, which is read per job, also from history', () => {
  const { db, runner, processes } = setup();
  const id = runner.start('fake.history', 'fake', []);
  processes[0]?.line('kept', 'stdout');
  processes[0]?.end(0);
  assert.equal('output' in (runner.list()[0] ?? {}), false);
  const reopened = createJobRunner(db, () => ({ kill() {} }), 2);
  assert.deepEqual(
    reopened.output(id).map((line) => line.message),
    ['kept'],
  );
  runner.close();
  db.$client.close();
});

void test('clearHistory drops finished jobs and keeps the running ones', () => {
  const { db, runner, processes } = setup();
  const done = runner.start('fake.done', 'fake', []);
  processes[0]?.end(0);
  const running = runner.start('fake.running', 'fake', []);
  runner.clearHistory();
  assert.deepEqual(
    runner.list().map((job) => job.id),
    [running],
  );
  assert.deepEqual(runner.output(done), []);
  runner.close();
  db.$client.close();
});

void test('tracked jobs stream bounded output, persist it, and finish only once', async () => {
  const { db, runner, processes } = setup(1);
  const changes = runner.updates();
  await changes.next();
  const changed = changes.next();
  const job = runner.track('lavoro.raccogli');
  assert.equal((await changed).value?.find((row) => row.id === job.id)?.status, 'running');
  const lines = runner.lines(job.id);
  const next = lines.next();
  job.log('prima');
  assert.equal((await next).value?.message, 'prima');
  for (let i = 0; i < 600; i++) job.log(String(i), i === 599 ? 'stderr' : 'stdout');
  assert.equal(runner.output(job.id).length, 500);
  assert.equal(runner.output(job.id).at(-1)?.stream, 'stderr');
  // Tracking does not take a child-process slot.
  runner.start('fake.process', 'fake', []);
  assert.equal(processes.length, 1);
  job.finish('failed', 2);
  const finished = runner.list().find((row) => row.id === job.id);
  job.finish('completed', 0);
  job.log('troppo tardi');
  assert.deepEqual(
    runner.list().find((row) => row.id === job.id),
    finished,
  );
  assert.equal(finished?.exitCode, 2);
  assert.equal(runner.output(job.id).at(-1)?.message, '599');
  const reopened = createJobRunner(
    db,
    () => {
      throw new Error('No spawn');
    },
    1,
  );
  assert.equal(reopened.output(job.id).length, 50);
  assert.equal(reopened.output(job.id)[0]?.message, '550');
  await lines.return(undefined);
  await changes.return(undefined);
  runner.close();
  reopened.close();
  db.$client.close();
});

void test('tracked cancellation and shutdown abort once, and restart cancels stale jobs', () => {
  const { db, runner } = setup();
  let cancelled = 0;
  const job = runner.track('lavoro.prova', {
    onCancel: () => {
      cancelled++;
      job.finish('completed');
    },
  });
  assert.equal(runner.cancel(job.id), true);
  assert.equal(runner.cancel(job.id), false);
  assert.equal(cancelled, 1);
  assert.equal(runner.list().find((row) => row.id === job.id)?.status, 'cancelled');
  const stale = runner.track('lavoro.pareri');
  stale.log('prima del riavvio');
  const reopened = createJobRunner(
    db,
    () => {
      throw new Error('No spawn');
    },
    1,
  );
  assert.equal(reopened.list().find((row) => row.id === stale.id)?.status, 'cancelled');
  let closed = 0;
  const closing = reopened.track('fake.close', { onCancel: () => closed++ });
  reopened.close();
  reopened.close();
  assert.equal(closed, 1);
  assert.equal(reopened.list().find((row) => row.id === closing.id)?.status, 'cancelled');
  assert.throws(() => reopened.track('fake.closed'), /closed/);
  runner.close();
  db.$client.close();
});
