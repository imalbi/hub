import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { openDb } from '../db/index.ts';
import { createCatalogService, HARDENED_GIT_FLAGS } from './catalog.ts';
import { run, type Run } from './exec.ts';
import { createJobRunner } from './jobs.ts';

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-catalog-sync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const remote = join(dir, 'remote');
  await mkdir(remote);
  async function git(repo: string, ...args: string[]) {
    const result = await run('git', [...HARDENED_GIT_FLAGS, '-C', repo, ...args], {
      env: { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    assert.equal(result.code, 0, result.stderr);
    return result.stdout.trim();
  }
  await git(remote, 'init', '--initial-branch=main');
  async function commit(repo: string, message: string) {
    await git(repo, 'add', '-A');
    await git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', message);
    return git(repo, 'rev-parse', 'HEAD');
  }
  async function manifest(version: string) {
    await writeFile(
      join(remote, 'hub-catalog.json'),
      JSON.stringify({
        version: 1,
        name: 'Fixture catalog',
        description: 'Fixture modules',
        modules: [{ name: 'sample', title: 'Sample', description: 'Fixture', version, path: 'sample' }],
      }),
    );
  }
  await mkdir(join(remote, 'sample'));
  await writeFile(join(remote, 'sample/server.ts'), 'export default {};\n');
  await writeFile(join(remote, '.gitignore'), 'ignored\n');
  await manifest('1.0.0');
  await commit(remote, 'initial');
  const db = openDb(join(dir, 'hub.db'));
  const jobs = createJobRunner(db, () => ({ kill() {} }), 1);
  const calls: string[][] = [];
  let intercept: Run | undefined;
  const runner: Run = async (bin, args, options) => {
    calls.push(args);
    if (intercept) {
      const result = await intercept(bin, args, options);
      if (result.code !== 0) return result;
    }
    const actual = [...args];
    if (args.includes('clone')) actual[actual.length - 2] = pathToFileURL(remote).href;
    return run(bin, actual, {
      ...options,
      env: {
        ...options?.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      },
    });
  };
  const installedDir = join(dir, 'installed');
  const catalog = createCatalogService({
    db,
    run: runner,
    jobs,
    reposDir: join(dir, 'repos'),
    installedDir,
    localDir: join(dir, 'local'),
  });
  t.after(() => {
    catalog.close();
    jobs.close();
    db.$client.close();
  });
  const source = await catalog.addSource({ url: 'https://example.com/fixture/catalog.git' });
  const repo = join(dir, 'repos', source.id);
  await catalog.installModule({ sourceId: source.id, name: 'sample' });
  calls.length = 0;
  async function snapshot() {
    const state = await catalog.state();
    return {
      head: await git(repo, 'rev-parse', 'HEAD'),
      index: await git(repo, 'ls-files', '--stage'),
      status: await git(repo, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'),
      manifest: await readFile(join(repo, 'hub-catalog.json'), 'utf8'),
      installed: await readFile(join(installedDir, 'sample/server.ts'), 'utf8'),
      state: { ...state, sources: state.sources.map((entry) => ({ ...entry, syncError: null })) },
    };
  }
  async function advance(invalid = false) {
    if (invalid) await writeFile(join(remote, 'hub-catalog.json'), '{invalid');
    else await manifest('1.1.0');
    return commit(remote, 'upstream update');
  }
  return {
    catalog,
    source,
    repo,
    remote,
    git,
    commit,
    advance,
    snapshot,
    calls,
    intercept: (callback: Run) => {
      intercept = callback;
    },
  };
}

for (const kind of ['tracked', 'staged', 'untracked', 'ignored']) {
  void test(`catalog sync preserves ${kind} files, index, installed module and metadata`, async (t) => {
    const f = await fixture(t);
    await f.advance();
    const file =
      kind === 'tracked' || kind === 'staged' ? 'sample/server.ts' : kind === 'ignored' ? 'ignored' : 'new.txt';
    await writeFile(join(f.repo, file), 'local work\n');
    if (kind === 'staged') await f.git(f.repo, 'add', file);
    if (kind === 'ignored') {
      await writeFile(join(f.remote, file), 'incoming collision\n');
      await f.git(f.remote, 'add', '-f', file);
      await f.commit(f.remote, 'incoming ignored path');
    }
    const before = await f.snapshot();
    const result = await f.catalog.syncSource({ id: f.source.id });
    assert.equal(result.ok, false);
    assert.deepEqual(await f.snapshot(), before);
    assert.equal(await readFile(join(f.repo, file), 'utf8'), 'local work\n');
    assert.equal(
      f.calls.some((args) => args.includes('fetch')),
      false,
    );
  });
}

for (const diverged of [false, true]) {
  void test(`catalog sync preserves ${diverged ? 'diverged' : 'ahead'} shallow local commits`, async (t) => {
    const f = await fixture(t);
    assert.equal(await f.git(f.repo, 'rev-parse', '--is-shallow-repository'), 'true');
    await writeFile(join(f.repo, 'local.txt'), 'committed work\n');
    await f.commit(f.repo, 'local commit');
    if (diverged) await f.advance();
    const before = await f.snapshot();
    assert.equal((await f.catalog.syncSource({ id: f.source.id })).ok, false);
    assert.deepEqual(await f.snapshot(), before);
    assert.equal(await readFile(join(f.repo, 'local.txt'), 'utf8'), 'committed work\n');
  });
}

void test('catalog sync fast-forwards a clean depth-one clone across missing history', async (t) => {
  const f = await fixture(t);
  await f.advance();
  await writeFile(join(f.remote, 'another.txt'), 'intermediate history\n');
  const target = await f.commit(f.remote, 'another upstream commit');
  const result = await f.catalog.syncSource({ id: f.source.id });
  assert.equal(result.ok, true);
  assert.equal(await f.git(f.repo, 'rev-parse', 'HEAD'), target);
  const state = await f.catalog.state();
  assert.equal(state.sources[0]?.commitSha, target);
  assert.equal(state.sources[0]?.modules[0]?.version, '1.1.0');
  assert.equal(state.sources[0]?.modules[0]?.updateAvailable, true);
});

for (const failHistory of [false, true]) {
  void test(`catalog sync ${failHistory ? 'refuses unavailable' : 'recovers missing'} shallow ancestry`, async (t) => {
    const f = await fixture(t);
    await f.advance();
    await f.git(f.repo, 'fetch', '--depth', '1', 'origin');
    const before = await f.snapshot();
    f.intercept(async (_bin, args) => ({
      code: failHistory && args.includes('--unshallow') ? 128 : 0,
      stdout: '',
      stderr: '',
    }));
    const result = await f.catalog.syncSource({ id: f.source.id });
    assert.equal(result.ok, !failHistory);
    assert.equal(
      f.calls.some((args) => args.includes('--unshallow')),
      true,
    );
    if (failHistory) assert.deepEqual(await f.snapshot(), before);
    else assert.equal((await f.catalog.state()).sources[0]?.modules[0]?.version, '1.1.0');
  });
}

void test('catalog sync rolls invalid manifest back to actual HEAD instead of stale database SHA', async (t) => {
  const f = await fixture(t);
  await f.advance();
  await f.git(f.repo, 'fetch', 'origin');
  await f.git(f.repo, 'merge', '--ff-only', 'FETCH_HEAD');
  const before = await f.snapshot();
  await f.advance(true);
  const result = await f.catalog.syncSource({ id: f.source.id });
  assert.equal(result.ok, false);
  assert.deepEqual(await f.snapshot(), before);
  assert.equal(
    f.calls.some((args) => args.includes('--hard')),
    false,
  );
});

for (const failure of ['status', 'rev-parse', 'fetch', 'merge-base', 'merge', 'reset']) {
  void test(`catalog sync safely reports ${failure} failure without changing successful metadata`, async (t) => {
    const f = await fixture(t);
    await f.advance(failure === 'reset');
    const before = await f.snapshot();
    f.intercept(async (_bin, args) => ({
      code: args.includes(failure) ? 128 : 0,
      stdout: '',
      stderr: 'private diagnostic must stay hidden',
    }));
    const result = await f.catalog.syncSource({ id: f.source.id });
    assert.equal(result.ok, false);
    assert.ok('error' in result);
    assert.doesNotMatch(result.error, /private diagnostic|example.com|\/tmp\//);
    if (failure === 'reset') {
      assert.match(result.error, /ripristin/i);
      const after = await f.snapshot();
      assert.deepEqual(
        after.state.sources.map((s) => s.commitSha),
        before.state.sources.map((s) => s.commitSha),
      );
      assert.equal(after.installed, before.installed);
      assert.equal(after.state.pendingApply, before.state.pendingApply);
    } else assert.deepEqual(await f.snapshot(), before);
    if (failure === 'status' || failure === 'rev-parse') {
      assert.equal(
        f.calls.some((args) => args.includes('fetch') || args.includes('merge')),
        false,
      );
    }
  });
}

void test('catalog sync refuses work created after fetch before applying the update', async (t) => {
  const f = await fixture(t);
  await f.advance();
  f.intercept(async (_bin, args) => {
    if (args.includes('fetch')) await writeFile(join(f.repo, 'late.txt'), 'late work\n');
    return { code: 0, stdout: '', stderr: '' };
  });
  const before = await f.snapshot();
  assert.equal((await f.catalog.syncSource({ id: f.source.id })).ok, false);
  assert.equal(await readFile(join(f.repo, 'late.txt'), 'utf8'), 'late work\n');
  const after = await f.snapshot();
  assert.equal(after.head, before.head);
  assert.equal(after.index, before.index);
  assert.deepEqual(after.state, before.state);
  assert.equal(
    f.calls.some((args) => args.includes('merge')),
    false,
  );
});

for (const race of ['tracked', 'ignored', 'head']) {
  void test(`catalog sync refuses a ${race} race at the fast-forward boundary`, async (t) => {
    const f = await fixture(t);
    await f.advance();
    if (race === 'ignored') {
      await writeFile(join(f.remote, 'ignored'), 'upstream\n');
      await f.git(f.remote, 'add', '-f', 'ignored');
      await f.commit(f.remote, 'incoming ignored collision');
    }
    const before = await f.snapshot();
    let raceHead = before.head;
    f.intercept(async (_bin, args) => {
      if (args.includes('merge')) {
        if (race === 'head') {
          await writeFile(join(f.repo, 'concurrent.txt'), 'concurrent commit\n');
          raceHead = await f.commit(f.repo, 'concurrent commit');
        } else {
          await writeFile(join(f.repo, race === 'tracked' ? 'hub-catalog.json' : 'ignored'), 'concurrent work\n');
        }
      }
      return { code: 0, stdout: '', stderr: '' };
    });
    assert.equal((await f.catalog.syncSource({ id: f.source.id })).ok, false);
    assert.equal(await f.git(f.repo, 'rev-parse', 'HEAD'), raceHead);
    assert.equal(
      await readFile(
        join(f.repo, race === 'head' ? 'concurrent.txt' : race === 'tracked' ? 'hub-catalog.json' : 'ignored'),
        'utf8',
      ),
      race === 'head' ? 'concurrent commit\n' : 'concurrent work\n',
    );
    const state = await f.catalog.state();
    assert.equal(state.sources[0]?.commitSha, f.source.commitSha);
    assert.equal(state.pendingApply, before.state.pendingApply);
    assert.equal(
      f.calls.some((args) => args.includes('reset')),
      false,
    );
  });
}

void test('catalog sync keeps concurrent work when invalid-manifest rollback cannot safely start', async (t) => {
  const f = await fixture(t);
  await f.advance(true);
  let statusCalls = 0;
  f.intercept(async (_bin, args) => {
    if (args.includes('status') && ++statusCalls === 3) {
      await writeFile(join(f.repo, 'concurrent.txt'), 'keep during recovery\n');
    }
    return { code: 0, stdout: '', stderr: '' };
  });
  const result = await f.catalog.syncSource({ id: f.source.id });
  assert.equal(result.ok, false);
  assert.ok('error' in result);
  assert.match(result.error, /ripristin/i);
  assert.equal(await readFile(join(f.repo, 'concurrent.txt'), 'utf8'), 'keep during recovery\n');
  assert.equal(
    f.calls.some((args) => args.includes('reset')),
    false,
  );
  assert.equal((await f.catalog.state()).sources[0]?.commitSha, f.source.commitSha);
});
