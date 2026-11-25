import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { createDeviceSockets } from '../../core/auth.ts';
import { emptyConfig } from '../../core/config.ts';
import { createFiles } from '../../core/files.ts';
import { createJobRunner } from '../../core/jobs.ts';
import { streamSpawn } from '../../core/exec.ts';
import { openDb } from '../../db/index.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { createNotes, isDay, localDay } from './notes.ts';
import { createNotesRouter } from './router.ts';

process.env.NODE_ENV = 'test';

const noteList = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    forDay: z.string(),
    source: z.string(),
    about: z.object({ source: z.string(), id: z.string(), title: z.string() }).nullable(),
  }),
);
const listed = z.object({ result: z.object({ data: noteList }) });

function open(dbPath: string) {
  const app = buildServer({ dbPath, deps: { run: createFakeDesktop() } });
  const call = (path: string, payload: object) =>
    app.inject({ method: 'POST', url: `/trpc/${path}`, headers: { 'content-type': 'application/json' }, payload });
  const notes = async () =>
    listed.parse((await app.inject({ method: 'GET', url: '/trpc/notes.open' })).json()).result.data;
  return { app, call, notes };
}

void test('add, edit, remove and restore persist across a restart; bad text and days are refused', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-notes-'));
  const dbPath = join(root, 'hub.db');
  const first = open(dbPath);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const added = await first.call('notes.add', { text: '  Ripartire dallo step 40  ', forDay: '2026-11-20' });
  assert.equal(added.statusCode, 200);
  const [note] = await first.notes();
  assert.ok(note);
  assert.equal(note.text, 'Ripartire dallo step 40');
  assert.equal(note.forDay, '2026-11-20');
  assert.equal(note.source, 'desk');
  assert.equal((await first.call('notes.add', { text: '   ' })).statusCode, 400);
  assert.equal((await first.call('notes.add', { text: 'x'.repeat(281) })).statusCode, 400);
  assert.equal((await first.call('notes.add', { text: 'ok', forDay: '2026-02-30' })).statusCode, 400);
  assert.equal((await first.call('notes.add', { text: 'ok', forDay: 'domani' })).statusCode, 400);
  assert.equal((await first.call('notes.edit', { id: note.id, text: 'Prima riga\nseconda riga' })).statusCode, 200);
  assert.deepEqual(
    (await first.notes()).map(({ text, forDay }) => ({ text, forDay })),
    [{ text: 'Prima riga\nseconda riga', forDay: '2026-11-20' }],
  );
  assert.equal((await first.call('notes.remove', { id: note.id })).statusCode, 200);
  assert.deepEqual(await first.notes(), []);
  assert.equal((await first.call('notes.restore', { id: note.id })).statusCode, 200);
  assert.equal((await first.call('notes.remove', { id: 'missing' })).statusCode, 404);
  await first.app.close();
  const second = open(dbPath);
  t.after(() => second.app.close());
  assert.deepEqual(
    (await second.notes()).map(({ id }) => id),
    [note.id],
  );
});

void test('a note added by an agent over MCP keeps its day and its source', async (t) => {
  const { app, notes } = open(':memory:');
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { accept: 'application/json, text/event-stream' },
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'notes.add',
        arguments: {
          text: 'Domani ripartire dal piano',
          forDay: '2099-01-02',
          about: { source: 'hello-greetings', id: '1', title: 'Ciao' },
        },
      },
    },
  });
  assert.equal(response.statusCode, 200);
  const [note] = await notes();
  assert.equal(note?.forDay, '2099-01-02');
  assert.equal(note?.source, 'agent:Locale');
  assert.deepEqual(note?.about, { source: 'hello-greetings', id: '1', title: 'Ciao' });
  const actions = (await app.inject('/trpc/registry.list')).json().result.data;
  const action = actions.find((item: { path: string }) => item.path === 'notes.add');
  assert.ok(action.schema.properties.about);
});

void test('without a day the note is for the server local today', () => {
  assert.equal(localDay(new Date(2026, 10, 4, 23, 59)), '2026-11-04');
  assert.equal(isDay('2026-11-04'), true);
  assert.equal(isDay('2026-13-04'), false);
});

void test('references round-trip, filter open notes and can be cleared', async (t) => {
  const { app, call, notes } = open(':memory:');
  t.after(() => app.close());
  const about = { source: 'hello-greetings', id: '1', title: 'Ciao' };
  for (const text of ['first', 'second', 'removed']) {
    assert.equal((await call('notes.add', { text, about })).statusCode, 200);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  await call('notes.add', { text: 'other', about: { ...about, id: '2' } });
  const all = await notes();
  assert.deepEqual(all.find((note) => note.text === 'first')?.about, about);
  const removed = all.find((note) => note.text === 'removed');
  assert.ok(removed);
  await call('notes.remove', { id: removed.id });
  const input = encodeURIComponent(JSON.stringify({ source: about.source, id: about.id }));
  const response = await app.inject({ method: 'GET', url: `/trpc/notes.about?input=${input}` });
  assert.deepEqual(
    listed.parse(response.json()).result.data.map((note) => note.text),
    ['second', 'first'],
  );
  const first = all.find((note) => note.text === 'first');
  assert.ok(first);
  await call('notes.edit', { id: first.id, text: first.text, about: null });
  assert.equal((await notes()).find((note) => note.id === first.id)?.about, null);
  assert.equal((await call('notes.add', { text: 'bad', about: { ...about, title: 'x'.repeat(201) } })).statusCode, 400);
  // A Lavoro posting key is `company|title` and often runs past 64 characters: it must be accepted.
  const longKey = `${'societa esempio consulting'.padEnd(60, 'x')}|sviluppatore front end react typescript`;
  assert.equal((await call('notes.add', { text: 'long', about: { ...about, id: longKey } })).statusCode, 200);
  assert.equal((await notes()).find((note) => note.text === 'long')?.about?.id, longKey);
});

void test('paired device receives about: null on open/onOpen and empty results on about, while loopback keeps full about', async (t) => {
  const { app, call } = open(':memory:');
  t.after(() => app.close());

  const LAN = '192.0.2.25';
  const ref = { source: 'lavoro-postings', id: 'example-co|frontend', title: 'Private Company Title' };
  assert.equal((await call('notes.add', { text: 'Nota con riferimento', about: ref })).statusCode, 200);

  const codeRes = await app.inject({ method: 'POST', url: '/trpc/pairing.createCode', payload: {} });
  const code = codeRes.json().result.data.code;
  const pairRes = await app.inject({
    method: 'POST',
    url: '/trpc/pairing.redeem',
    remoteAddress: LAN,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ code, deviceName: 'Phone' }),
  });
  const deviceToken: string = pairRes.json().result.data.token;

  const loopbackOpen = listed.parse((await app.inject('/trpc/notes.open')).json()).result.data;
  assert.deepEqual(loopbackOpen[0]?.about, ref);

  const deviceOpenRes = await app.inject({
    url: '/trpc/notes.open',
    remoteAddress: LAN,
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  assert.equal(deviceOpenRes.statusCode, 200);
  const deviceOpen = listed.parse(deviceOpenRes.json()).result.data;
  assert.equal(deviceOpen.length, 1);
  assert.equal(deviceOpen[0]?.about, null);
  assert.ok(!deviceOpenRes.body.includes('Private Company Title'));

  const refInput = encodeURIComponent(JSON.stringify({ source: ref.source, id: ref.id }));
  const loopbackAbout = listed.parse((await app.inject(`/trpc/notes.about?input=${refInput}`)).json()).result.data;
  assert.equal(loopbackAbout.length, 1);

  const deviceAboutRes = await app.inject({
    url: `/trpc/notes.about?input=${refInput}`,
    remoteAddress: LAN,
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  assert.equal(deviceAboutRes.statusCode, 200);
  assert.deepEqual(listed.parse(deviceAboutRes.json()).result.data, []);

  // Verify live subscription filtering per subscriber context on onOpen.
  const db = openDb(':memory:');
  const files = createFiles();
  const jobs = createJobRunner(db, streamSpawn, 2);
  t.after(async () => {
    jobs.close();
    await files.close();
    db.$client.close();
  });
  const store = createNotes(db);
  await store.add({ text: 'Prima nota', about: ref }, 'desk');
  const router = createNotesRouter(store);
  const baseContext = {
    db,
    files,
    jobs,
    run: createFakeDesktop(),
    config: emptyConfig,
    remoteAddress: '',
    sockets: createDeviceSockets(),
    restart: () => false,
  };
  const deviceCaller = router.createCaller({
    ...baseContext,
    client: { kind: 'device', deviceId: 1, expiresAt: Date.now() + 86_400_000 },
  });
  const loopbackCaller = router.createCaller({ ...baseContext, client: { kind: 'loopback' } });

  const deviceSub = (await deviceCaller.onOpen())[Symbol.asyncIterator]();
  const loopbackSub = (await loopbackCaller.onOpen())[Symbol.asyncIterator]();
  t.after(async () => {
    await Promise.all([deviceSub.return?.(), loopbackSub.return?.()]);
  });

  const firstDevice = (await deviceSub.next()).value;
  const firstLoopback = (await loopbackSub.next()).value;
  assert.equal(firstDevice?.[0]?.about, null);
  assert.deepEqual(firstLoopback?.[0]?.about, ref);

  const nextDevice = deviceSub.next();
  const nextLoopback = loopbackSub.next();
  await store.add({ text: 'Seconda nota', about: ref }, 'desk');
  assert.equal((await nextDevice).value?.[0]?.about, null);
  assert.deepEqual((await nextLoopback).value?.[0]?.about, ref);
});
