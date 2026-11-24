import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { acquireLock, balance, fileStats, resolveWorkers, runQueue, type Job, WORKERS } from './test-e2e.ts';

const job = (label: string): Job => ({ label, command: 'x', args: [], env: {} });
const tick = () => new Promise<void>((done) => setImmediate(done));

void test('the queue starts jobs in order, never more than the slots at once, and a free slot takes the next job', async () => {
  const started: string[] = [];
  let live = 0;
  let peak = 0;
  const code = await runQueue(['a', 'b', 'c', 'd', 'e', 'f'].map(job), 4, async (j) => {
    started.push(j.label);
    peak = Math.max(peak, ++live);
    await tick();
    await tick();
    live -= 1;
    return 0;
  });
  assert.equal(code, 0);
  assert.equal(peak, 4);
  assert.deepEqual(started, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.ok(WORKERS <= 4, 'never more than the 4 processes the owner approved');
});

void test('a failing job stops new jobs, lets the running ones finish and the exit code is 1', async () => {
  const finished: string[] = [];
  const code = await runQueue(['a', 'b', 'c', 'd'].map(job), 2, async (j) => {
    await tick();
    finished.push(j.label);
    return j.label === 'a' ? 1 : 0;
  });
  assert.equal(code, 1);
  assert.deepEqual(finished, ['a', 'b']);
});

void test('balance puts the heaviest file in the lightest bin', () => {
  const bins = balance(
    [
      { file: 'a', weight: 10 },
      { file: 'b', weight: 9 },
      { file: 'c', weight: 5 },
      { file: 'd', weight: 5 },
      { file: 'e', weight: 1 },
    ],
    2,
  );
  assert.deepEqual(
    bins.map((bin) => bin.weight),
    [15, 15],
  );
});

void test('fileStats sums tests and durations per file, nested describes included', () => {
  const stats = fileStats({
    suites: [
      {
        file: 'x.spec.ts',
        specs: [{ tests: [{ results: [{ duration: 100 }] }] }],
        suites: [{ specs: [{ tests: [{ results: [{ duration: 50 }, { duration: 25 }] }] }] }],
      },
    ],
  });
  assert.deepEqual(stats.get('x.spec.ts'), { tests: 2, ms: 175 });
});

void test('the lock waits for a live holder, says so once, and takes over a stale one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lock-test-'));
  const path = join(dir, 'lock');
  try {
    const release = await acquireLock(path);
    let waits = 0;
    let told = 0;
    const second = acquireLock(path, {
      alive: () => true,
      onWait: () => (told += 1),
      sleep: async () => {
        waits += 1;
        if (waits === 3) release();
      },
    });
    const releaseSecond = await second;
    assert.equal(told, 1);
    assert.equal(waits, 3);
    releaseSecond();

    writeFileSync(path, JSON.stringify({ pid: 999999999 }));
    const taken = await acquireLock(path, { alive: () => false });
    taken();
    writeFileSync(path, 'not json');
    (await acquireLock(path, { alive: () => true }))();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test('resolveWorkers clamps valid integers to 1..WORKERS and falls back to WORKERS otherwise', () => {
  const configured = process.env.HUB_E2E_WORKERS;
  try {
    delete process.env.HUB_E2E_WORKERS;
    assert.equal(resolveWorkers(undefined), WORKERS);
    process.env.HUB_E2E_WORKERS = '3';
    assert.equal(resolveWorkers(), 3);
  } finally {
    if (configured === undefined) delete process.env.HUB_E2E_WORKERS;
    else process.env.HUB_E2E_WORKERS = configured;
  }
  assert.equal(resolveWorkers('2'), 2);
  assert.equal(resolveWorkers('0'), 1);
  assert.equal(resolveWorkers('99'), WORKERS);
  assert.equal(resolveWorkers('2x'), WORKERS);
});
