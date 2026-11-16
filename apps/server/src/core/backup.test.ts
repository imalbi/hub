import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { z } from 'zod';
import { buildServer } from '../server.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { emptyConfig } from './config.ts';
import { openDb } from '../db/index.ts';
import { createDeviceSockets } from './auth.ts';
import { streamSpawn } from './exec.ts';
import { createFiles } from './files.ts';
import { createJobRunner } from './jobs.ts';
import { createBackup, createBackupRouter, localDate, planPrune, startDailyCheck } from './backup.ts';

process.env.NODE_ENV = 'test';

const envelope = z.object({
  result: z.object({ data: z.unknown().optional() }).optional(),
  error: z.object({ data: z.object({ code: z.string() }) }).optional(),
});
const stateSchema = z.object({
  status: z.string(),
  error: z.string().optional(),
  date: z.string().optional(),
  copies: z.number().optional(),
});
const today = localDate(new Date());

async function setup(t: TestContext, backup: { dir?: string; keep?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hub-backup-'));
  const dbPath = join(root, 'hub.db');
  const app = buildServer({
    dbPath,
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, backup: { enabled: true, keep: 14, ...backup } },
    isLoopback: (peer) => peer.headers['x-test-remote'] !== 'yes',
  });
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  const call = async (
    method: 'GET' | 'POST',
    path: string,
    init: { token?: string; remote?: boolean; input?: unknown } = {},
  ) => {
    const res = await app.inject({
      method,
      url: `/trpc/${path}`,
      headers: {
        'content-type': 'application/json',
        ...(init.token && { authorization: `Bearer ${init.token}` }),
        ...(init.remote && { 'x-test-remote': 'yes' }),
      },
      payload: method === 'POST' ? JSON.stringify(init.input ?? {}) : undefined,
    });
    const body = envelope.parse(res.json());
    return { data: body.result?.data, code: body.error?.data.code };
  };
  return { root, dbPath, dir: backup.dir ?? join(root, 'backups'), call };
}

const agentNames = (file: string) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db
      .prepare('select name from agents order by id')
      .all()
      .map((row) => String(row.name));
  } finally {
    db.close();
  }
};

void test('a run copies the core and a module database; later writes stay out, the live one keeps writing', async (t) => {
  const { root, dir, call } = await setup(t);
  await call('POST', 'agents.create', { input: { name: 'before' } });
  // Test-only second handle on the study module's file, to give it a row to find in the copy.
  const own = new DatabaseSync(join(root, 'modules', 'study.db'));
  own.exec("create table probe (x text); insert into probe values ('kept')");
  own.close();

  const run = stateSchema.parse((await call('POST', 'backup.run')).data);
  assert.equal(run.status, 'ok');
  assert.deepEqual(agentNames(join(dir, today, 'hub.db')), ['before']);
  const copy = new DatabaseSync(join(dir, today, 'modules', 'study.db'), { readOnly: true });
  assert.deepEqual(
    copy
      .prepare('select x from probe')
      .all()
      .map((row) => row.x),
    ['kept'],
  );
  copy.close();

  assert.equal((await call('POST', 'agents.create', { input: { name: 'after' } })).code, undefined);
  assert.deepEqual(agentNames(join(dir, today, 'hub.db')), ['before']);
  assert.deepEqual(agentNames(join(root, 'hub.db')), ['before', 'after']);

  // A second run the same day replaces the folder and leaves no partial one.
  await call('POST', 'backup.run');
  assert.deepEqual(await readdir(dir), [today]);
  assert.deepEqual(agentNames(join(dir, today, 'hub.db')), ['before', 'after']);
  const state = stateSchema.parse((await call('GET', 'backup.state')).data);
  assert.deepEqual([state.status, state.date, state.copies], ['ok', today, 1]);
});

void test('the prune plan keeps the newest dates by count and ignores other names', () => {
  assert.deepEqual(planPrune(['2026-11-01', 'notes', '2026-11-03', '2026-11-02', '2026-11-03.partial'], 2), [
    '2026-11-01',
  ]);
  assert.deepEqual(planPrune(['2026-11-01'], 14), []);
});

void test('a failed copy keeps older copies, leaves no partial and answers a fixed sentence', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-backup-fail-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const core = new DatabaseSync(':memory:');
  t.after(() => core.close());
  const dir = join(root, 'backups');
  await mkdir(join(dir, '2026-01-01'), { recursive: true });
  const service = createBackup({ dbPath: join(root, 'hub.db'), core, dir, keep: 1 });
  // A file where the dated folder's parent must be: the copy cannot start.
  const blocked = join(root, 'blocked');
  await writeFile(blocked, 'x');
  const failing = createBackup({ dbPath: join(root, 'hub.db'), core, dir: blocked });
  const failed = await failing.run();
  assert.deepEqual(failed, { status: 'failed', error: 'Copia non riuscita' });
  assert.doesNotMatch(JSON.stringify(await failing.state()), /\//);
  // Pruning never runs before a copy: a failure leaves the old one in place, a success trims it.
  assert.deepEqual(await readdir(dir), ['2026-01-01']);
  const bad = createBackup({ dbPath: join(root, 'hub.db'), core, dir, keep: 1 });
  bad.add('gone', new DatabaseSync(':memory:'));
  const closed = new DatabaseSync(':memory:');
  closed.close();
  bad.add('closed', closed);
  assert.equal((await bad.run()).status, 'failed');
  assert.deepEqual(await readdir(dir), ['2026-01-01']);
  assert.equal((await service.run()).status, 'ok');
  assert.deepEqual(await readdir(dir), [localDate(new Date())]);
});

void test('the daily check copies at start, not again within the day, and again after midnight', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-backup-clock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const core = new DatabaseSync(':memory:');
  t.after(() => core.close());
  let at = new Date(2026, 10, 16, 22, 30);
  const service = createBackup({ dbPath: join(root, 'hub.db'), core, now: () => at });
  let tick = () => Promise.resolve();
  let stopped = false;
  const { started, stop } = startDailyCheck(service, (task) => {
    tick = task;
    return () => void (stopped = true);
  });
  await started;
  const listing = () => readdir(join(root, 'backups'));
  assert.deepEqual(await listing(), ['2026-11-16']);
  const firstCopy = await stat(join(root, 'backups', '2026-11-16', 'hub.db'));
  at = new Date(2026, 10, 16, 23, 30);
  await tick();
  assert.deepEqual(await listing(), ['2026-11-16']);
  assert.equal((await stat(join(root, 'backups', '2026-11-16', 'hub.db'))).mtimeMs, firstCopy.mtimeMs);
  at = new Date(2026, 10, 17, 0, 30);
  await tick();
  assert.deepEqual(await listing(), ['2026-11-16', '2026-11-17']);
  stop();
  assert.equal(stopped, true);
});

void test('only the PC or an agent reaches backup; a paired device and an anonymous peer do not', async (t) => {
  const { call } = await setup(t);
  const code = z.object({ code: z.string() }).parse((await call('POST', 'pairing.createCode')).data).code;
  const device = z
    .object({ token: z.string() })
    .parse((await call('POST', 'pairing.redeem', { input: { code, deviceName: 'Phone' }, remote: true })).data).token;
  for (const [method, path] of [
    ['GET', 'backup.state'],
    ['POST', 'backup.run'],
  ] as const) {
    assert.equal((await call(method, path, { remote: true, token: device })).code, 'FORBIDDEN', `${path} device`);
    assert.equal((await call(method, path, { remote: true })).code, 'UNAUTHORIZED', `${path} anonymous`);
    assert.equal((await call(method, path)).code, undefined, `${path} loopback`);
  }
});

void test('an agent token passes backup through the router', async (t) => {
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
  });
  const caller = createBackupRouter(createBackup({ dbPath: ':memory:' })).createCaller({
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
  assert.deepEqual(await caller.state(), { status: 'off' });
  assert.deepEqual(await caller.run(), { status: 'off' });
});

void test('with an in-memory database nothing is written and the state says it is off', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const run = await app.inject({ method: 'POST', url: '/trpc/backup.run', payload: {} });
  assert.equal(run.json().result.data.status, 'off');
  const state = await app.inject({ method: 'GET', url: '/trpc/backup.state' });
  assert.deepEqual(state.json().result.data, { status: 'off' });
});

void test('closing the server during the start copy lets it finish before any database closes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-backup-close-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = buildServer({
    dbPath: join(root, 'hub.db'),
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, backup: { enabled: true, keep: 14 } },
    autoBackup: true,
  });
  await app.ready();
  // Regression: module databases closed in the plugin scope before the root hook waited for the copy.
  await app.close();
  assert.deepEqual(await readdir(join(root, 'backups')), [today]);
  assert.ok((await readdir(join(root, 'backups', today, 'modules'))).includes('study.db'));
});
