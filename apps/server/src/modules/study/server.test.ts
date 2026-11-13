import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../db/index.ts';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';
import { readPlan } from './inbox.ts';
import { planSchema } from './plan.ts';
import { savePlan } from './store.ts';

process.env.NODE_ENV = 'test';

void test('reads a folder plan in chunk name order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'study-test-'));
  try {
    const source = planSchema.parse(
      JSON.parse(await readFile(new URL('./fixtures/example.json', import.meta.url), 'utf8')),
    );
    const { days, ...header } = source;
    await mkdir(join(dir, 'folder'));
    await writeFile(join(dir, 'single.json'), JSON.stringify(source));
    await writeFile(join(dir, 'folder', 'plan.json'), JSON.stringify(header));
    await Promise.all(
      days.map((day: unknown, index: number) =>
        writeFile(join(dir, 'folder', `days-0${index}.json`), JSON.stringify([day])),
      ),
    );
    assert.deepEqual(await readPlan(join(dir, 'folder')), await readPlan(join(dir, 'single.json')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

void test('inbox reports plans and activation archives a valid file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'study-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'in-arrivo'));
  await writeFile(
    join(dir, 'in-arrivo', 'example.json'),
    await readFile(new URL('./fixtures/example.json', import.meta.url)),
  );
  await writeFile(join(dir, 'in-arrivo', 'broken.json'), '{}');
  await mkdir(join(dir, 'in-arrivo', 'broken-folder'));
  const source = JSON.parse(await readFile(new URL('./fixtures/example.json', import.meta.url), 'utf8'));
  const { days, ...header } = source;
  await writeFile(join(dir, 'in-arrivo', 'unsafe.json'), JSON.stringify({ ...source, id: 'a/b' }));
  await writeFile(join(dir, 'in-arrivo', 'broken-folder', 'plan.json'), JSON.stringify(header));
  await writeFile(
    join(dir, 'in-arrivo', 'broken-folder', 'days-01.json'),
    JSON.stringify([{ ...days[0], phase: 'missing' }]),
  );
  await mkdir(join(dir, 'in-arrivo', 'unreadable'));
  await writeFile(join(dir, 'in-arrivo', 'unreadable', 'plan.json'), JSON.stringify(header));
  await writeFile(join(dir, 'in-arrivo', 'unreadable', 'days-01.json'), '{');
  await writeFile(
    join(dir, 'in-arrivo', 'many.json'),
    JSON.stringify({
      ...source,
      days: Array.from({ length: 60 }, (_, i) => ({ ...days[0], id: `d${i}`, phase: 'missing', blocks: [] })),
    }),
  );
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, study: { plansDir: dir, materialDirs: [] } },
  });
  t.after(() => app.close());
  const inbox = (await app.inject('/trpc/study.inbox')).json().result.data;
  const unsafe = inbox.find((entry: { name: string }) => entry.name === 'unsafe.json');
  assert.equal(unsafe.valid, false);
  assert.ok(unsafe.issues.some((issue: { path: string }) => issue.path === 'id'));
  assert.notEqual(
    (await app.inject({ method: 'POST', url: '/trpc/study.activate', payload: { name: 'unsafe.json' } })).statusCode,
    200,
  );
  const found = inbox.find((entry: { name: string }) => entry.name === 'example.json');
  assert.equal(found?.valid, true);
  // Piani previews a found plan without activating it: its size and first day titles.
  assert.equal(found?.days, 3);
  assert.deepEqual(found?.preview.slice(0, 2), ['La foglia', 'Il cielo']);
  assert.equal(inbox.find((entry: { name: string }) => entry.name === 'broken.json')?.valid, false);
  const broken = inbox.find((entry: { name: string }) => entry.name === 'broken-folder');
  assert.ok(
    broken.issues.some(
      (issue: { file: string; path: string }) => issue.file === 'days-01.json' && issue.path === '0.phase',
    ),
  );
  assert.equal(inbox.find((entry: { name: string }) => entry.name === 'unreadable').issues[0].file, 'days-01.json');
  const many = inbox.find((entry: { name: string }) => entry.name === 'many.json');
  assert.equal(many.issues.length, 50);
  assert.equal(many.remainingIssues, 10);
  assert.notEqual(
    (await app.inject({ method: 'POST', url: '/trpc/study.activate', payload: { name: 'broken.json' } })).statusCode,
    200,
  );
  const response = await app.inject({ method: 'POST', url: '/trpc/study.activate', payload: { name: 'example.json' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (await app.inject('/trpc/study.active')).json().result.data.map((plan: { id: string }) => plan.id),
    ['example'],
  );
  const page = await app.inject('/trpc/study.days?input=%7B%22offset%22%3A0%2C%22limit%22%3A1%7D');
  assert.equal(page.json().result.data.length, 1);
  assert.equal(page.json().result.data[0].id, 'A01');
  const paused = await app.inject({
    method: 'POST',
    url: '/trpc/study.setSubject',
    payload: { plan: 'example', id: 'b', state: 'paused' },
  });
  assert.equal(paused.statusCode, 200);
  const index = (await app.inject('/trpc/study.index')).json().result.data;
  assert.deepEqual(
    index.days.map((day: { id: string; g: number }) => [day.id, day.g]),
    [
      ['A01', 1],
      ['A02', 2],
    ],
  );
  assert.ok(await readFile(join(dir, 'archivio', 'example.json')));
  const original = await readFile(join(dir, 'archivio', 'example.json'), 'utf8');
  await writeFile(join(dir, 'in-arrivo', 'example.json'), original);
  assert.equal(
    (await app.inject({ method: 'POST', url: '/trpc/study.activate', payload: { name: 'example.json' } })).statusCode,
    200,
  );
  assert.equal(await readFile(join(dir, 'archivio', 'example.json'), 'utf8'), original);
  assert.equal((await readdir(join(dir, 'archivio'))).length, 2);
});

void test('revisions retain progress, including ids no longer present', async () => {
  const db = openDatabase(':memory:', fileURLToPath(new URL('./drizzle', import.meta.url)));
  try {
    const plan = planSchema.parse(
      JSON.parse(await readFile(new URL('./fixtures/example.json', import.meta.url), 'utf8')),
    );
    savePlan(db, plan);
    db.$client
      .prepare('INSERT INTO progress (plan_id, kind, id, value) VALUES (?, ?, ?, ?)')
      .run(plan.id, 'step', 'old', 'done');
    savePlan(db, { ...plan, version: 2, days: plan.days.slice(0, 1) });
    assert.equal(db.$client.prepare('SELECT value FROM progress WHERE id = ?').get('old')?.value, 'done');
  } finally {
    db.$client.close();
  }
});

void test('activating a revision preserves kept and removed progress', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'study-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'in-arrivo'));
  const plan = planSchema.parse(
    JSON.parse(await readFile(new URL('./fixtures/example.json', import.meta.url), 'utf8')),
  );
  await writeFile(join(dir, 'in-arrivo', 'first.json'), JSON.stringify(plan));
  const app = buildServer({
    dbPath: join(dir, 'hub.db'),
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, study: { plansDir: dir, materialDirs: [] } },
  });
  t.after(() => app.close());
  const activate = (name: string) => app.inject({ method: 'POST', url: '/trpc/study.activate', payload: { name } });
  assert.equal((await activate('first.json')).statusCode, 200);
  const db = new DatabaseSync(join(dir, 'modules', 'study.db'));
  try {
    const insert = db.prepare('INSERT INTO progress (plan_id, kind, id, value) VALUES (?, ?, ?, ?)');
    insert.run(plan.id, 'step', 'A01.m.1', 'done');
    insert.run(plan.id, 'step', 'A02.m.1', 'done');
    await writeFile(
      join(dir, 'in-arrivo', 'revision.json'),
      JSON.stringify({ ...plan, version: 2, days: plan.days.slice(0, 2) }),
    );
    assert.equal((await activate('revision.json')).statusCode, 200);
    assert.deepEqual(
      db
        .prepare('SELECT id, value FROM progress ORDER BY id')
        .all()
        .map((row) => [row.id, row.value]),
      [
        ['A01.m.1', 'done'],
        ['A02.m.1', 'done'],
      ],
    );
  } finally {
    db.close();
  }
});

void test('validates and stores 500 days with 5000 steps within two seconds', async () => {
  const db = openDatabase(':memory:', fileURLToPath(new URL('./drizzle', import.meta.url)));
  try {
    const source = planSchema.parse(
      JSON.parse(await readFile(new URL('./fixtures/example.json', import.meta.url), 'utf8')),
    );
    const day = source.days[0];
    if (!day) throw new Error('Missing fixture day');
    const large = {
      ...source,
      days: Array.from({ length: 500 }, (_, index) => ({
        ...day,
        id: `day-${index}`,
        recall: [],
        blocks: [
          {
            id: `block-${index}`,
            title: 'Studio',
            steps: Array.from({ length: 10 }, (_, n) => ({ id: `step-${index}-${n}`, text: 'Studia' })),
          },
        ],
      })),
    };
    const started = performance.now();
    savePlan(db, planSchema.parse(large));
    assert.ok(performance.now() - started < 2000);
    assert.equal(db.$client.prepare('SELECT count(*) AS n FROM days').get()?.n, 500);
  } finally {
    db.$client.close();
  }
});

void test('activates 500 days and 5000 steps within two seconds', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'study-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'in-arrivo'));
  const plan = planSchema.parse(
    JSON.parse(await readFile(new URL('./fixtures/example.json', import.meta.url), 'utf8')),
  );
  const template = plan.days[0];
  if (!template) throw new Error('Missing fixture day');
  const days = Array.from({ length: 500 }, (_, i) => ({
    ...template,
    id: `day-${i}`,
    recall: [],
    blocks: [
      {
        id: `block-${i}`,
        title: 'Studio',
        steps: Array.from({ length: 10 }, (_, n) => ({ id: `step-${i}-${n}`, text: 'Studia' })),
      },
    ],
  }));
  await writeFile(join(dir, 'in-arrivo', 'large.json'), JSON.stringify({ ...plan, days }));
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop() },
    config: { ...emptyConfig, study: { plansDir: dir, materialDirs: [] } },
  });
  t.after(() => app.close());
  const start = performance.now();
  const response = await app.inject({ method: 'POST', url: '/trpc/study.activate', payload: { name: 'large.json' } });
  assert.equal(response.statusCode, 200);
  assert.ok(performance.now() - start < 2000);
  assert.equal((await app.inject('/trpc/study.index')).json().result.data.days.length, 500);
});

/** A one-subject plan of `count` equal days, the usual "one plan per course" case of decision 15. */
function course(id: string, count: number) {
  return planSchema.parse({
    schema: 'hub.study-plan/1',
    id,
    title: `Corso ${id}`,
    version: 1,
    subjects: [{ id: 'a', name: `Materia ${id}` }],
    threads: [],
    phases: [],
    method: [],
    days: Array.from({ length: count }, (_, i) => ({
      id: `D${i + 1}`,
      subject: 'a',
      title: `${id} ${i + 1}`,
      threads: [],
      recall: [],
      kind: 'study',
      blocks: [],
      check: '',
    })),
  });
}

void test('several active plans interleave by the global mix, and a paused plan leaves the sequence', async (t) => {
  const { readDaysById, readIndex } = await import('./read.ts');
  const db = openDatabase(':memory:', fileURLToPath(new URL('./drizzle', import.meta.url)));
  t.after(() => db.$client.close());
  // Same day ids in both plans: days are told apart by plan.
  savePlan(db, course('p', 10));
  savePlan(db, course('q', 10));
  const order = () => readIndex(db)?.days.map((day) => day.planId) ?? [];
  // Activating a second plan keeps the first; with no mix they share equally.
  assert.deepEqual(order().slice(0, 4), ['p', 'q', 'p', 'q']);
  assert.equal(readIndex(db)?.mixSet, false);
  db.$client
    .prepare('INSERT INTO preferences (plan_id, weekly_hours, mix) VALUES (?, ?, ?)')
    .run('*', 600, JSON.stringify({ 'p:a': 75, 'q:a': 25 }));
  const mixed = order().slice(0, 8);
  assert.equal(mixed.filter((plan) => plan === 'p').length, 6);
  assert.deepEqual(
    readIndex(db)
      ?.days.slice(0, 2)
      .map((day) => day.key),
    ['p/D1', 'q/D1'],
  );
  assert.deepEqual(
    readDaysById(db, ['q/D1']).map((day) => [day.planId, day.title]),
    [['q', 'q 1']],
  );
  // A third plan the mix does not name: the stored mix is set aside and the three share equally.
  savePlan(db, course('r', 3));
  assert.equal(readIndex(db)?.mixSet, false);
  assert.deepEqual(order().slice(0, 3).sort(), ['p', 'q', 'r']);
  // Pausing a plan takes its days out; resuming brings them back with the same mix.
  db.$client.prepare('UPDATE plans SET active = 0 WHERE id = ?').run('r');
  assert.equal(readIndex(db)?.mixSet, true);
  assert.ok(!order().includes('r'));
  assert.equal(readIndex(db)?.days.length, 20);
});

void test('progress and subject state survive reload and export valid state after rapid changes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'study-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'in-arrivo'));
  await writeFile(
    join(dir, 'in-arrivo', 'example.json'),
    await readFile(new URL('./fixtures/example.json', import.meta.url)),
  );
  const config = { ...emptyConfig, study: { plansDir: dir, materialDirs: [] } };
  const make = () => buildServer({ dbPath: join(dir, 'hub.db'), deps: { run: createFakeDesktop() }, config });
  let app = make();
  const post = (name: string, payload: object) => app.inject({ method: 'POST', url: `/trpc/study.${name}`, payload });
  assert.equal((await post('activate', { name: 'example.json' })).statusCode, 200);
  assert.equal((await post('setCurrent', { key: 'example/A02' })).statusCode, 200);
  assert.equal((await post('setAutonomy', { plan: 'example', id: 'plants', value: 'green' })).statusCode, 200);
  for (let n = 0; n < 10; n++)
    assert.equal((await post('setStep', { key: 'example/A02', id: 'A02.m.1', done: n % 2 === 1 })).statusCode, 200);
  assert.equal((await post('setNote', { key: 'example/A02', text: 'Nota' })).statusCode, 200);
  let index = (await app.inject('/trpc/study.index')).json().result.data;
  assert.equal(index.current, 'example/A02');
  assert.equal(index.days.find((day: { id: string }) => day.id === 'A02').done, true);
  assert.equal(index.days.find((day: { id: string }) => day.id === 'A01').done, false);
  await app.close();
  const exported = JSON.parse(await readFile(join(dir, 'stato', 'example.json'), 'utf8'));
  assert.equal(exported.currentDay, 'A02');
  assert.equal(exported.autonomy.plants, 'green');
  assert.equal(exported.days.find((day: { id: string }) => day.id === 'A02').note, 'Nota');
  assert.ok(Number.isFinite(Date.parse(exported.days.find((day: { id: string }) => day.id === 'A02').doneAt)));
  assert.deepEqual(exported.days.find((day: { id: string }) => day.id === 'A02').openSteps, []);
  app = make();
  t.after(() => app.close());
  index = (await app.inject('/trpc/study.index')).json().result.data;
  assert.equal(index.current, 'example/A02');
  assert.equal((await post('setSubject', { plan: 'example', id: 'a', state: 'passed' })).statusCode, 200);
  index = (await app.inject('/trpc/study.index')).json().result.data;
  assert.equal(index.current, 'example/B01');
  assert.ok(index.hiddenDays.some((day: { id: string }) => day.id === 'A01'));
  assert.equal((await post('setSubject', { plan: 'example', id: 'a', state: 'active' })).statusCode, 200);
  index = (await app.inject('/trpc/study.index')).json().result.data;
  assert.equal(index.current, 'example/B01');
  assert.ok(index.days.some((day: { id: string }) => day.id === 'A01'));
});
