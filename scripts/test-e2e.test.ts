import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  acquireLock,
  balance,
  fileStats,
  resolveWorkers,
  runQueue,
  runVariants,
  variantStampKey,
  type Variant,
  type Job,
  WORKERS,
} from './test-e2e.ts';

import { readPassStamps, writePassStamp } from './verify-stamp.ts';

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

void test('cached variants skip builds and Playwright; uncached variants run both and record passes', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-e2e-cache-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.HUB_VERIFY_NO_CACHE;
  process.env.HUB_VERIFY_NO_CACHE = '0';
  t.after(() => {
    if (previous === undefined) delete process.env.HUB_VERIFY_NO_CACHE;
    else process.env.HUB_VERIFY_NO_CACHE = previous;
  });
  const stamps = join(dir, 'passes');
  const durations = join(dir, 'durations');
  const all: Variant[] = [
    { name: 'public', moduleRoot: dir, examples: false, shards: 3 },
    { name: 'example', moduleRoot: dir, examples: true, shards: 2 },
  ];
  const seen: string[] = [];
  const options = {
    stamps,
    inputHash: () => 'same',
    runJob: async (j: Job) => {
      seen.push(j.label);
      return 0;
    },
    jobsFor: (variants: Variant[]) => ({ jobs: variants.map((v) => job(v.name)), reportOf: {} }),
  };
  for (const v of all) writePassStamp(stamps, variantStampKey(v, false), 'same');
  assert.equal(await runVariants(all, dir, durations, options), 0);
  assert.deepEqual(seen, []);
  writePassStamp(stamps, 'e2e:public', 'old');
  assert.equal(await runVariants(all, dir, durations, options), 0);
  assert.deepEqual(seen, ['build public', 'public']);
  assert.equal(readPassStamps(stamps)['e2e:public'], 'same');
});

void test('failed or drifting e2e runs never write pass stamps; custom roots bypass caching', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-e2e-drift-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const stamps = join(dir, 'passes');
  const all: Variant[] = [{ name: 'public', moduleRoot: dir, examples: false, shards: 1 }];
  let hash = 'start';
  let failed = false;
  const options = {
    stamps,
    inputHash: () => hash,
    runJob: async (j: Job) => {
      if (j.label === 'public') hash = 'end';
      return failed ? 1 : 0;
    },
    jobsFor: () => ({ jobs: [job('public')], reportOf: {} }),
  };
  assert.equal(await runVariants(all, dir, join(dir, 'durations'), options), 0);
  assert.deepEqual(readPassStamps(stamps), {});
  failed = true;
  assert.equal(await runVariants(all, dir, join(dir, 'durations'), options), 1);
  assert.deepEqual(readPassStamps(stamps), {});
  const previous = process.env.HUB_MODULES_ROOT;
  process.env.HUB_MODULES_ROOT = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.HUB_MODULES_ROOT;
    else process.env.HUB_MODULES_ROOT = previous;
  });
  failed = false;
  options.inputHash = () => {
    throw new Error('fixture runs must not hash');
  };
  assert.equal(await runVariants(all, dir, join(dir, 'durations'), options), 0);
  assert.deepEqual(readPassStamps(stamps), {});
});
