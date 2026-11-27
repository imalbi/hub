import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDb } from '../db/index.ts';
import { briefState } from '../db/schema.ts';
import { createCalendar } from '../modules/calendar/calendar.ts';
import { createNotes } from '../modules/notes/notes.ts';
import { buildServer } from '../server.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { createDeviceSockets } from './auth.ts';
import { createFiles } from './files.ts';
import { createJobRunner } from './jobs.ts';
import { streamSpawn } from './exec.ts';
import { createBrief, createBriefRouter } from './brief.ts';
import { configSchema } from './config.ts';
import { createLlmGate } from './llm-gate.ts';
import { createLlmUsageStore } from '../db/llm-usage.ts';

process.env.NODE_ENV = 'test';
const bullets = ['Un appuntamento in calendario.', 'Un post-it per oggi.', 'Il resto della giornata è libero.'];
const response = () => Response.json({ message: { content: JSON.stringify({ bullets }) } });
const config = configSchema.parse({ assistant: { enabled: true } });
const quiet = { warn() {} };
const at = new Date(2026, 0, 5, 8);

void test('brief coalesces tabs, persists across DB restart, refreshes explicitly and rolls over locally', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'hub-brief-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'hub.db');
  let db = openDb(path);
  t.after(() => db.$client.close());
  let calls = 0;
  let clock = at;
  const fetcher: typeof fetch = async () => {
    calls++;
    return response();
  };
  let brief = createBrief({ db, config: config.assistant, fetcher, log: quiet, now: () => clock });
  const results = await Promise.all([brief.ensureToday(), brief.ensureToday()]);
  assert.equal(calls, 1);
  assert.deepEqual(results[0]?.bullets, bullets);
  assert.equal(results[0]?.lastCursorAt, at.getTime());
  db.$client.close();
  db = openDb(path);
  brief = createBrief({ db, config: config.assistant, fetcher, log: quiet, now: () => clock });
  await brief.ensureToday();
  assert.equal(calls, 1);
  clock = new Date(2026, 0, 5, 9);
  assert.equal((await brief.refresh()).generatedAt, clock.getTime());
  assert.equal(calls, 2);
  clock = new Date(2026, 0, 6, 0, 1);
  assert.equal((await brief.ensureToday()).day, '2026-01-06');
  assert.equal(calls, 3);
});

void test('bounded context includes live notes, events and series occurrences with skips', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.$client.close());
  const calendar = createCalendar(db, () => at);
  calendar.add({ title: 'Appuntamento', day: '2026-01-05', start: '09:00' }, 'desk');
  calendar.add({ title: 'Domani', day: '2026-01-06' }, 'desk');
  const removed = calendar.add({ title: 'Rimosso', day: '2026-01-05' }, 'desk');
  calendar.setRemoved(removed.id, true);
  calendar.addSeries(
    {
      title: 'Serie',
      kind: 'event',
      person: null,
      days: [{ weekday: 1, start: '11:00', end: '12:00' }],
      fromDay: '2026-01-01',
      untilDay: null,
    },
    'desk',
  );
  const skipped = calendar.addSeries(
    {
      title: 'Salto',
      kind: 'event',
      person: null,
      days: [{ weekday: 1, start: '13:00', end: '14:00' }],
      fromDay: '2026-01-01',
      untilDay: null,
    },
    'desk',
  );
  calendar.editOccurrence(skipped.id, '2026-01-05', null);
  const notes = createNotes(db, () => at);
  await notes.add({ text: 'Post-it', forDay: '2026-01-05' }, 'desk');
  await notes.add({ text: 'Domani', forDay: '2026-01-06' }, 'desk');
  const removedNote = await notes.add({ text: 'Rimosso', forDay: '2026-01-05' }, 'desk');
  await notes.setRemoved(removedNote.id, true);
  let request = '';
  const brief = createBrief({
    db,
    config: config.assistant,
    log: quiet,
    now: () => at,
    fetcher: async (_url, init) => {
      request = typeof init?.body === 'string' ? init.body : '';
      return response();
    },
  });
  const result = await brief.ensureToday();
  assert.deepEqual(result.counts, { calendar: 2, notes: 1 });
  for (const title of ['Appuntamento', 'Serie', 'Post-it']) assert.ok(request.includes(title));
  for (const title of ['Domani', 'Rimosso', 'Salto']) assert.equal(request.includes(title), false);
  for (let index = 0; index < 30; index++) await notes.add({ text: 'x'.repeat(800), forDay: '2026-01-05' }, 'desk');
  assert.equal((await brief.refresh()).counts.notes, 20);
  assert.equal(request.includes('x'.repeat(401)), false);
});

void test('background triage and chat yield to interactive calls and never consume the daily cap', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.$client.close());
  await createNotes(db, () => at).add({ text: 'Post-it', forDay: '2026-01-05' }, 'desk');
  const gate = createLlmGate(createLlmUsageStore(db));
  const order: string[] = [];
  let release: (() => void) | undefined;
  const active = gate(
    2,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const brief = createBrief({
    db,
    gate,
    config: { ...config.assistant, decisionModel: 'decision' },
    now: () => at,
    log: quiet,
    fetcher: async (url) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (href.endsWith('/systemone')) {
        order.push('triage');
        return Response.json({
          model: 'decision',
          answers: { item0: { type: 'noul', noul: 0.8 } },
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }
      order.push('chat');
      return response();
    },
  });
  const background = brief.ensureToday();
  const interactive = gate(
    2,
    async () => {
      order.push('assistant');
    },
    { front: true },
  );
  release?.();
  await Promise.all([active, background, interactive]);
  assert.deepEqual(order, ['assistant', 'triage', 'chat']);
  assert.equal(gate.used(), 2);
});

for (const failure of ['disabled', 'network', '500', 'invalid', 'timeout']) {
  void test(`brief degrades on ${failure}, preserves cursor and never retries automatically`, async (t) => {
    if (failure === 'timeout') t.mock.timers.enable({ apis: ['setTimeout'] });
    const db = openDb(':memory:');
    t.after(() => db.$client.close());
    await createNotes(db, () => at).add({ text: 'Post-it', forDay: '2026-01-05' }, 'desk');
    db.insert(briefState)
      .values({ id: 1, day: '2026-01-04', status: 'ready', lastCursorAt: new Date(123), itemsJson: '[]' })
      .run();
    const warnings: unknown[] = [];
    let calls = 0;
    const args = {
      db,
      config: { ...config.assistant, enabled: failure !== 'disabled' },
      now: () => at,
      gate: createLlmGate(),
      log: {
        warn: (...args: unknown[]) => {
          warnings.push(args);
        },
      },
      fetcher: async () => {
        calls++;
        if (failure === 'network') throw new Error('private provider payload');
        if (failure === '500') return new Response('private provider payload', { status: 500 });
        if (failure === 'timeout') return new Promise<Response>(() => {});
        return Response.json({ message: { content: 'invalid' } });
      },
    };
    let brief = createBrief(args);
    const work = brief.ensureToday();
    if (failure === 'timeout') t.mock.timers.tick(30_000);
    const result = await work;
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.counts, { calendar: 0, notes: 1 });
    assert.equal(result.lastCursorAt, 123);
    assert.equal(result.generatedAt, null);
    brief = createBrief(args);
    await brief.ensureToday();
    assert.equal(calls, failure === 'disabled' ? 0 : 1);
    assert.equal(warnings.length, 1);
    assert.equal(JSON.stringify(warnings).includes('private provider payload'), false);
  });
}

void test('brief routes protect context and register only refresh; assistant cap survives server restart', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'hub-brief-server-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'hub.db');
  const gate = createLlmGate();
  const make = () =>
    buildServer({ dbPath: path, deps: { run: createFakeDesktop(), fetch: async () => response(), llmGate: gate } });
  let app = make();
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/trpc/brief.ensureToday',
        headers: { 'content-type': 'application/json' },
        payload: 'null',
      })
    ).statusCode,
    200,
  );
  const actions = (await app.inject('/trpc/registry.list')).json().result.data;
  assert.ok(actions.some((a: { path: string }) => a.path === 'brief.refresh'));
  assert.ok(!actions.some((a: { path: string }) => a.path === 'brief.ensureToday'));
  await gate(2, async () => 'counted');
  await app.close();
  app = make();
  t.after(() => app.close());
  assert.equal(gate.used(), 1);
  const remote = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, isLoopback: () => false });
  t.after(() => remote.close());
  for (const route of ['latest', 'ensureToday', 'refresh']) {
    const result = await remote.inject({
      method: route === 'latest' ? 'GET' : 'POST',
      url: `/trpc/brief.${route}`,
      ...(route !== 'latest' && { headers: { 'content-type': 'application/json' }, payload: 'null' }),
    });
    assert.equal(result.statusCode, 401);
  }
});

void test('cached context is available to agents, never paired devices; only loopback can generate', async (t) => {
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
  });
  const brief = createBrief({ db, config: config.assistant, fetcher: async () => response(), log: quiet });
  const routes = createBriefRouter(brief);
  const context = {
    db,
    files,
    jobs,
    config,
    run: createFakeDesktop(),
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  };
  const agent = routes.createCaller({ ...context, client: { kind: 'agent', agentId: 1, name: 'Test' } });
  const device = routes.createCaller({
    ...context,
    client: { kind: 'device', deviceId: 1, expiresAt: Date.now() + 86_400_000 },
  });
  assert.equal((await agent.latest()).status, 'idle');
  await assert.rejects(device.latest(), { code: 'FORBIDDEN' });
  for (const caller of [agent, device]) {
    await assert.rejects(caller.ensureToday(), { code: 'FORBIDDEN' });
    await assert.rejects(caller.refresh(), { code: 'FORBIDDEN' });
  }
  assert.equal(brief.latest().day, null);
});
