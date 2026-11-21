import { createFocusHistory } from './core/focus-history.ts';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { defineModule, z } from './core/module.ts';
import { router } from './core/trpc.ts';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

const api = JSON.stringify(new URL('./core/module.ts', import.meta.url).href);
const trpc = JSON.stringify(new URL('./core/trpc.ts', import.meta.url).href);
const createMemo = `CREATE TABLE \`memo\` (\`id\` integer PRIMARY KEY AUTOINCREMENT, \`body\` text NOT NULL);`;

/** A discovered module `name` in `<root>/<name>/`; `options` is the extra source of its definition. */
async function writeModule(root: string, name: string, options: string, sql?: string) {
  await mkdir(join(root, name, 'drizzle', '20261105000000_init'), { recursive: true });
  if (sql) await writeFile(join(root, name, 'drizzle', '20261105000000_init', 'migration.sql'), sql);
  const folder = JSON.stringify(join(root, name, 'drizzle'));
  await writeFile(
    join(root, name, 'server.ts'),
    `import { defineModule, z } from ${api}; import { router, protectedProcedure } from ${trpc};
const rows = (db, sql) => db.$client.prepare(sql).all();
export default defineModule({
  name: ${JSON.stringify(name)},
  ${options.replaceAll('$FOLDER', folder)}
  create: ({ db, ...rest }) => ({
    router: router({
      hasDb: protectedProcedure.query(() => db !== undefined),
      hasCoreDeps: protectedProcedure.query(() => Object.keys(rest).toSorted()),
      tables: protectedProcedure.query(() => rows(db, "select name from sqlite_master where type = 'table'").map((r) => r.name)),
      list: protectedProcedure.query(() => rows(db, 'select body from memo order by id').map((r) => r.body)),
      add: protectedProcedure
        .meta({ label: 'Aggiungi', description: 'Add a note' })
        .input(z.object({ body: z.string() }))
        .mutation(({ input }) => { db.$client.prepare('insert into memo (body) values (?)').run(input.body); }),
    }),
    // Runs while the server closes: it can only write if the database is still open then.
    close: () => { if (db) db.$client.exec("insert into memo (body) values ('closed')"); },
  }),
});`,
  );
}

async function scratch(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-module-db-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const get = (app: ReturnType<typeof buildServer>, path: string) => app.inject(`/trpc/${path}`);
const add = (app: ReturnType<typeof buildServer>, body: string) =>
  app.inject({
    method: 'POST',
    url: '/trpc/memo.add',
    headers: { 'content-type': 'application/json' },
    payload: { body },
  });
const greet = (app: ReturnType<typeof buildServer>) =>
  app.inject({
    method: 'POST',
    url: '/trpc/hello.greet',
    headers: { 'content-type': 'application/json' },
    payload: {},
  });
const data = (response: { json: () => unknown }) =>
  z.object({ result: z.object({ data: z.unknown() }) }).parse(response.json()).result.data;

void test('a module that declares migrations gets its own database: its table exists and the core tables do not', async (t) => {
  const root = await scratch(t);
  await writeModule(root, 'memo', 'migrations: $FOLDER,', createMemo);
  const app = buildServer({ dbPath: ':memory:', moduleRoots: [root], deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  const tables = data(await get(app, 'memo.tables'));
  assert.ok(Array.isArray(tables));
  assert.ok(tables.includes('memo'));
  assert.ok(!tables.includes('devices'));
  assert.equal(
    data(await get(app, 'devices.list')) !== undefined,
    true,
    'the core database still serves its own module',
  );
});

void test('a discovered module without migrations gets no database', async (t) => {
  const root = await scratch(t);
  await writeModule(root, 'plain', '');
  const app = buildServer({ dbPath: ':memory:', moduleRoots: [root], deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  assert.equal(data(await get(app, 'plain.hasDb')), false);
  assert.deepEqual(data(await get(app, 'plain.hasCoreDeps')), [
    'config',
    'fetch',
    'focusHistory',
    'log',
    'run',
    'zones',
  ]);
});

void test('the type of a module without migrations has no db, with migrations it has one', () => {
  defineModule({
    name: 'typed',
    // @ts-expect-error -- `db` exists only for a module that declares migrations
    create: ({ db }) => ({ router: router({}), close: () => void db }),
  });
  defineModule({
    name: 'typed',
    migrations: '/module/drizzle',
    create: ({ db }) => ({ router: router({}), close: () => db.$client.close() }),
  });
});

void test('a module with a broken migration, a missing folder, a relative folder or a core db request is skipped; others keep working', async (t) => {
  const root = await scratch(t);
  await writeModule(root, 'memo', 'migrations: $FOLDER,', createMemo);
  await writeModule(root, 'badsql', 'migrations: $FOLDER,', 'THIS IS NOT SQL;');
  await writeModule(root, 'nofolder', `migrations: ${JSON.stringify(join(root, 'nowhere'))},`);
  await writeModule(root, 'relative', "migrations: 'drizzle',", createMemo);
  await writeModule(root, 'greedy', 'coreDb: true,');
  await writeModule(root, 'jobs', '');
  const app = buildServer({ dbPath: ':memory:', moduleRoots: [root], deps: { run: createFakeDesktop() } });
  t.after(() => app.close());
  assert.equal((await add(app, 'still works')).statusCode, 200);
  assert.deepEqual(data(await get(app, 'memo.list')), ['still works']);
  for (const name of ['badsql', 'nofolder', 'relative', 'greedy'])
    assert.equal((await get(app, `${name}.tables`)).statusCode, 404, name);
  assert.equal((await get(app, 'jobs.hasDb')).statusCode, 404);
  assert.equal((await get(app, 'audio.state')).statusCode, 200);
});

void test('a database file that cannot be opened skips only its module', async (t) => {
  const dir = await scratch(t);
  const root = join(dir, 'modules-src');
  await writeModule(root, 'memo', 'migrations: $FOLDER,', createMemo);
  await writeModule(root, 'blocked', 'migrations: $FOLDER,', createMemo);
  // A directory where the file should be.
  await mkdir(join(dir, 'state', 'modules', 'blocked.db'), { recursive: true });
  const app = buildServer({
    dbPath: join(dir, 'state', 'hub.db'),
    moduleRoots: [root],
    deps: { run: createFakeDesktop() },
  });
  t.after(() => app.close());
  assert.equal((await get(app, 'blocked.tables')).statusCode, 404);
  assert.equal((await get(app, 'memo.tables')).statusCode, 200);
});

void test('the file lives next to a file-backed core database; a second start keeps the data and applies migrations once', async (t) => {
  const dir = await scratch(t);
  const root = join(dir, 'modules-src');
  await writeModule(root, 'memo', 'migrations: $FOLDER,', createMemo);
  const options = { dbPath: join(dir, 'state', 'hub.db'), moduleRoots: [root], deps: { run: createFakeDesktop() } };
  const file = join(dir, 'state', 'modules', 'memo.db');

  const first = buildServer(options);
  assert.equal((await add(first, 'kept')).statusCode, 200);
  assert.ok(existsSync(join(dir, 'state', 'hub.db')));
  assert.ok(existsSync(file));
  assert.ok(existsSync(`${file}-wal`), 'WAL mode is on while the server runs');
  await first.close();

  // The module's own close wrote a row after the last request: the database was still open for it.
  const second = buildServer(options);
  t.after(() => second.close());
  assert.deepEqual(data(await get(second, 'memo.list')), ['kept', 'closed']);
});

void test('closing the server closes the module database: WAL flushed, file free to reopen', async (t) => {
  const dir = await scratch(t);
  const root = join(dir, 'modules-src');
  await writeModule(root, 'memo', 'migrations: $FOLDER,', createMemo);
  const app = buildServer({ dbPath: join(dir, 'hub.db'), moduleRoots: [root], deps: { run: createFakeDesktop() } });
  await add(app, 'flushed');
  const file = join(dir, 'modules', 'memo.db');
  assert.ok(existsSync(`${file}-wal`));
  await app.close();
  assert.ok(!existsSync(`${file}-wal`), 'the last connection checkpoints and removes the WAL');
  const reopened = new DatabaseSync(file);
  t.after(() => reopened.close());
  reopened.exec('BEGIN IMMEDIATE; COMMIT;');
  assert.deepEqual(
    reopened
      .prepare('select body from memo order by id')
      .all()
      .map((row) => row.body),
    ['flushed', 'closed'],
  );
});

void test('the example module keeps its greeting count across a restart', async (t) => {
  const dir = await scratch(t);
  const options = {
    dbPath: join(dir, 'hub.db'),
    moduleRoots: [],
    exampleModules: true,
    deps: { run: createFakeDesktop() },
  };
  const first = buildServer(options);
  assert.equal((await greet(first)).statusCode, 200);
  assert.equal((await greet(first)).statusCode, 200);
  await first.close();
  const second = buildServer(options);
  t.after(() => second.close());
  assert.deepEqual(data(await get(second, 'hello.state')), { greeting: 'Ciao dal modulo di esempio', count: 2 });
  assert.ok(existsSync(join(dir, 'modules', 'hello.db')));
});

void test('a public module with migrations receives its own migrated database', async (t) => {
  const { createAppRouter } = await import('./router.ts');
  const { openDb } = await import('./db/index.ts');
  const fastify = (await import('fastify')).default;
  const root = await scratch(t);
  await writeModule(root, 'memo', 'migrations: $FOLDER,', createMemo);
  const db = openDb(':memory:');
  const closes: Array<() => void | Promise<void>> = [];
  let created = false;
  const module = defineModule({
    name: 'public-memo',
    migrations: join(root, 'memo', 'drizzle'),
    create: ({ db: own }) => {
      created = true;
      assert.notEqual(own, db);
      assert.ok(own.$client.prepare("select name from sqlite_master where name = 'memo'").get());
      return { router: router({}) };
    },
  });
  createAppRouter(
    [module],
    { db, run: createFakeDesktop(), fetch, log: fastify().log, zones: new Set(), focusHistory: createFocusHistory(db) },
    {},
    (close) => closes.push(close),
    {},
    { dbPath: ':memory:' },
  );
  assert.equal(created, true);
  for (const close of closes.toReversed()) await close();
  db.$client.close();
});
