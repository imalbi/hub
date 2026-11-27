import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { moduleDbPath, openDatabase, openDb } from '../db/index.ts';
import type { Run } from './exec.ts';
import { createJobRunner } from './jobs.ts';
import { isAllowedGitUrl, type CatalogModuleEntry } from './catalog-manifest.ts';
import { createCatalogService } from './catalog.ts';

async function scratch(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-catalog-service-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeFakeRepo(
  repoPath: string,
  {
    name = 'Shared Catalog',
    description = 'Shared modules',
    modules = [
      {
        name: 'widget-mod',
        title: 'Widget Mod',
        description: 'A shared module',
        version: '1.0.0',
        path: 'modules/widget-mod',
      },
    ],
    createFiles = true,
  }: {
    name?: string;
    description?: string;
    modules?: CatalogModuleEntry[];
    createFiles?: boolean;
  } = {},
) {
  await mkdir(repoPath, { recursive: true });
  await writeFile(
    join(repoPath, 'hub-catalog.json'),
    JSON.stringify({ version: 1, name, description, modules }, null, 2),
  );
  if (createFiles) {
    for (const mod of modules) {
      const modDir = join(repoPath, mod.path);
      await mkdir(modDir, { recursive: true });
      await writeFile(join(modDir, 'server.ts'), `// version ${mod.version}\nexport default {};\n`);
    }
  }
}

void test('isAllowedGitUrl accepts https/ssh git URLs and rejects flags, file, ext, and whitespace', () => {
  for (const good of [
    'https://example.com/org/hub-shared.git',
    'https://example.com:8443/org/hub-shared',
    'git@example.com:org/hub-shared.git',
    'ssh://git@example.com:2222/org/hub-shared.git',
  ]) {
    assert.equal(isAllowedGitUrl(good), true, good);
  }
  for (const bad of [
    '',
    '-upload-pack=evil',
    '--upload-pack=evil',
    'file:///tmp/repo',
    'ext::sh -c id',
    'http://example.com/org/repo.git',
    'git://example.com/org/repo.git',
    'https://user:pass@example.com/org/repo.git',
    'https://example.com/org/repo.git?x=1',
    'https://example.com/org/repo.git#frag',
    'https://example.com/org/repo with space',
    'https://example.com/org/repo\nid',
    'https://example.com/.git',
    'git@example.com:-evil/repo.git',
  ]) {
    assert.equal(isAllowedGitUrl(bad), false, bad);
  }
});

void test('catalog service enforces hardened git args, manages sources, and preserves module DB on removal', async (t) => {
  const dir = await scratch(t);
  const dbPath = join(dir, 'state', 'hub.db');
  const db = openDb(dbPath);
  const jobs = createJobRunner(db, () => ({ kill() {} }), 2);

  const gitCalls: { bin: string; args: string[]; env?: Record<string, string> }[] = [];
  let headSha = '1111111111111111111111111111111111111111';
  let nextSha = '2222222222222222222222222222222222222222';
  let failFetch = false;
  let corruptManifestOnFetch = false;
  let invalidManifestOnClone = false;

  const run: Run = async (bin, args, options) => {
    gitCalls.push({ bin, args, env: options?.env });
    if (bin !== 'git') return { stdout: '', stderr: 'unexpected binary', code: 1 };
    if (args.includes('clone')) {
      const target = args.at(-1) ?? '';
      await writeFakeRepo(target, {
        modules: invalidManifestOnClone
          ? [{ name: 'catalog', title: 'Bad', description: 'Reserved', version: '1.0.0', path: 'bad' }]
          : undefined,
      });
      return { stdout: '', stderr: '', code: 0 };
    }
    if (args.includes('rev-parse')) {
      return { stdout: `${args.at(-1) === 'FETCH_HEAD' ? nextSha : headSha}\n`, stderr: '', code: 0 };
    }
    if (args.includes('status') || args.includes('merge-base')) return { stdout: '', stderr: '', code: 0 };
    if (args.includes('fetch')) {
      if (failFetch) return { stdout: '', stderr: 'offline', code: 128 };
      return { stdout: '', stderr: '', code: 0 };
    }
    if (args.includes('merge') || args.includes('reset')) {
      const repoIdx = args.indexOf('-C');
      const repoPath = repoIdx >= 0 ? (args[repoIdx + 1] ?? '') : '';
      const targetRef = args.at(-1) ?? '';
      if (args.includes('merge')) {
        headSha = nextSha;
        if (corruptManifestOnFetch) {
          await writeFile(join(repoPath, 'hub-catalog.json'), '{not-json');
        } else {
          await writeFakeRepo(repoPath, {
            modules: [
              {
                name: 'widget-mod',
                title: 'Widget Mod',
                description: 'Updated shared module',
                version: '1.1.0',
                path: 'modules/widget-mod',
              },
            ],
          });
        }
      } else {
        headSha = targetRef;
        await writeFakeRepo(repoPath);
      }
      return { stdout: '', stderr: '', code: 0 };
    }
    return { stdout: '', stderr: 'unknown git command', code: 1 };
  };

  const reposDir = join(dir, 'repos');
  const installedDir = join(dir, 'installed');
  const localDir = join(dir, 'local');
  await mkdir(localDir, { recursive: true });

  const catalog = createCatalogService({ db, run, jobs, reposDir, installedDir, localDir });
  t.after(() => {
    catalog.close();
    jobs.close();
    db.$client.close();
  });

  // Invalid manifest during addSource deletes the cloned directory and leaves no DB row.
  invalidManifestOnClone = true;
  await assert.rejects(() => catalog.addSource({ url: 'https://example.com/org/bad-repo.git' }));
  assert.equal((await catalog.state()).sources.length, 0);
  assert.equal(existsSync(join(reposDir, 'bad-repo')), false);
  invalidManifestOnClone = false;

  const added = await catalog.addSource({ url: 'git@example.com:org/hub-shared.git' });
  assert.equal(added.commitSha, '1111111111111111111111111111111111111111');

  // Assert hardened git flags and '--' before URL on clone.
  const cloneCall = gitCalls.find((c) => c.args.includes('clone'));
  assert.ok(cloneCall);
  assert.equal(cloneCall.env?.GIT_TERMINAL_PROMPT, '0');
  for (const flag of ['core.hooksPath=/dev/null', 'core.symlinks=false', 'submodule.recurse=false', '--']) {
    assert.ok(cloneCall.args.includes(flag), `missing ${flag}`);
  }

  // Install module into installedDir and create its own module DB file to check preservation on removal.
  const inst = await catalog.installModule({ sourceId: added.id, name: 'widget-mod' });
  assert.equal(inst.pendingApply, true);
  assert.equal(existsSync(join(installedDir, 'widget-mod', 'server.ts')), true);

  const modDbFile = moduleDbPath(dbPath, 'widget-mod');
  const modDbDir = join(dir, 'migrations');
  await mkdir(join(modDbDir, '20261123000000_init'), { recursive: true });
  await writeFile(
    join(modDbDir, '20261123000000_init', 'migration.sql'),
    'CREATE TABLE `items` (`id` integer PRIMARY KEY);',
  );
  const modDb = openDatabase(modDbFile, modDbDir);
  modDb.$client.exec('INSERT INTO items (id) VALUES (42);');
  modDb.$client.close();

  // Source removal is refused while a module from it is installed.
  await assert.rejects(() => catalog.removeSource({ id: added.id }), /Remove installed modules/);

  // Failed sync keeps working copy and existing commit intact.
  failFetch = true;
  const failedSync = await catalog.syncSource({ id: added.id });
  assert.equal(failedSync.ok, false);
  assert.equal((await catalog.state()).sources[0]?.syncError, 'Git fetch failed');
  failFetch = false;

  // Invalid upstream manifest rolls back to previous commit.
  corruptManifestOnFetch = true;
  const badManifestSync = await catalog.syncSource({ id: added.id });
  assert.equal(badManifestSync.ok, false);
  assert.equal((await catalog.state()).sources[0]?.commitSha, '1111111111111111111111111111111111111111');
  corruptManifestOnFetch = false;

  // Successful sync marks updateAvailable.
  const synced = await catalog.syncSource({ id: added.id });
  assert.equal(synced.ok, true);
  assert.equal((await catalog.state()).sources[0]?.modules[0]?.updateAvailable, true);

  // Update copies new files and clears updateAvailable.
  await catalog.updateModule({ name: 'widget-mod' });
  assert.match(await readFile(join(installedDir, 'widget-mod', 'server.ts'), 'utf8'), /version 1\.1\.0/);
  assert.equal((await catalog.state()).sources[0]?.modules[0]?.updateAvailable, false);

  // Local module conflict refuses install/update.
  await mkdir(join(localDir, 'local-mod'), { recursive: true });
  await writeFakeRepo(join(reposDir, added.id), {
    modules: [{ name: 'local-mod', title: 'Local', description: 'Conflict', version: '1.0.0', path: 'modules/local' }],
  });
  await assert.rejects(() => catalog.installModule({ sourceId: added.id, name: 'local-mod' }), /local module/);

  // Removing installed module deletes source folder only, leaving module SQLite DB intact.
  await catalog.removeModule({ name: 'widget-mod' });
  assert.equal(existsSync(join(installedDir, 'widget-mod')), false);
  assert.equal(existsSync(modDbFile), true);
  const reopenedModDb = openDatabase(modDbFile, modDbDir);
  assert.deepEqual(
    reopenedModDb.$client
      .prepare('SELECT id FROM items')
      .all()
      .map((row) => row.id),
    [42],
  );
  reopenedModDb.$client.close();

  // Now source removal succeeds and deletes repo folder.
  await catalog.removeSource({ id: added.id });
  assert.equal(existsSync(join(reposDir, added.id)), false);
  assert.equal((await catalog.state()).sources.length, 0);

  // Symlinked or missing hub-catalog.json is rejected without leaking OS paths.
  const outsideManifest = join(dir, 'outside-catalog.json');
  await writeFile(outsideManifest, JSON.stringify({ version: 1, name: 'Out', description: 'Out', modules: [] }));
  const leakRepo = join(dir, 'leak-repo');
  await mkdir(leakRepo, { recursive: true });
  const addedClean = await catalog.addSource({ url: 'https://example.com/org/clean-repo.git' });
  await rm(join(reposDir, addedClean.id, 'hub-catalog.json'));
  const missingState = (await catalog.state()).sources.find((s) => s.id === addedClean.id);
  assert.equal(missingState?.manifestError, 'Missing hub-catalog.json');
  assert.equal(missingState?.manifestError?.includes(dir), false);
  await symlink(outsideManifest, join(reposDir, addedClean.id, 'hub-catalog.json'));
  const symlinkState = (await catalog.state()).sources.find((s) => s.id === addedClean.id);
  assert.equal(symlinkState?.manifestError, 'hub-catalog.json must be a regular file');
  void leakRepo;
});

void test('catalog installs packages in staging before swapping and preserves both install and pending state on failure', async (t) => {
  const dir = await scratch(t);
  const db = openDb(':memory:');
  const jobs = createJobRunner(db, () => ({ kill() {} }), 2);
  const installedDir = join(dir, 'installed');
  const reposDir = join(dir, 'repos');
  let failInstall = false;
  let calls = 0;
  const run: Run = async (bin, args, options) => {
    if (bin === 'git' && args.includes('clone')) {
      const root = args.at(-1) ?? '';
      await writeFakeRepo(root);
      await writeFile(join(root, 'modules/widget-mod/package.json'), '{}');
      await writeFile(join(root, 'modules/widget-mod/pnpm-lock.yaml'), 'lockfileVersion: 9.0');
    }
    if (bin === 'pnpm') {
      calls++;
      const staging = args[2];
      assert.ok(staging?.startsWith(join(installedDir, '.tmp-widget-mod-')));
      assert.deepEqual(args, [
        'install',
        '--dir',
        staging,
        '--ignore-scripts',
        '--frozen-lockfile',
        '--ignore-workspace',
      ]);
      assert.equal(options?.timeoutMs, 120_000);
      assert.ok(options?.env?.PATH);
      assert.equal(existsSync(join(installedDir, 'widget-mod')), calls > 2);
      if (calls > 2) assert.equal(await readFile(join(installedDir, 'widget-mod/marker'), 'utf8'), 'preserved');
      if (failInstall) return { code: 1, stdout: '', stderr: 'private package error' };
      await mkdir(join(staging, 'node_modules'));
    }
    return {
      code: 0,
      stdout: args.includes('rev-parse') ? '1111111111111111111111111111111111111111\n' : '',
      stderr: '',
    };
  };
  const service = createCatalogService({ db, run, jobs, installedDir, reposDir, localDir: join(dir, 'local') });
  t.after(async () => {
    service.close();
    jobs.close();
    db.$client.close();
  });
  const source = await service.addSource({ url: 'https://example.com/catalog.git' });
  failInstall = true;
  await assert.rejects(
    () => service.installModule({ sourceId: source.id, name: 'widget-mod' }),
    /dependency installation failed/,
  );
  assert.equal((await service.state()).pendingApply, false);
  assert.equal(existsSync(join(installedDir, 'widget-mod')), false);
  failInstall = false;
  await service.installModule({ sourceId: source.id, name: 'widget-mod' });
  await writeFile(join(installedDir, 'widget-mod/marker'), 'preserved');
  const before = await service.state();
  failInstall = true;
  await assert.rejects(() => service.updateModule({ name: 'widget-mod' }), /dependency installation failed/);
  assert.deepEqual(await service.state(), before);
  assert.equal(await readFile(join(installedDir, 'widget-mod/marker'), 'utf8'), 'preserved');
  failInstall = false;
  await service.updateModule({ name: 'widget-mod' });
  assert.equal(calls, 4);
  assert.equal(existsSync(join(installedDir, 'widget-mod/marker')), false);
  assert.equal(existsSync(join(installedDir, 'widget-mod/node_modules')), true);
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(installedDir), ['widget-mod']);
});

void test('catalog checks the running Hub version and live dependencies on both install and update', async (t) => {
  const dir = await scratch(t);
  const db = openDb(':memory:');
  const jobs = createJobRunner(db, () => ({ kill() {} }), 2);
  let minimum = '^1.0.0';
  let active = ['audio', 'clock'];
  const reposDir = join(dir, 'repos');
  const module = {
    name: 'widget-mod',
    title: 'Widget',
    description: 'Shared widget',
    version: '1.0.0',
    path: 'widget',
    requires: ['audio', 'clock'],
    optional: { mail: 'Collega la posta.' },
  };
  const run: Run = async (_bin, args) => {
    if (args.includes('clone'))
      await writeFakeRepo(args.at(-1) ?? '', { modules: [{ ...module, minHubVersion: minimum }] });
    return { code: 0, stdout: args.includes('rev-parse') ? 'a'.repeat(40) : '', stderr: '' };
  };
  const service = createCatalogService({
    db,
    run,
    jobs,
    reposDir,
    installedDir: join(dir, 'installed'),
    localDir: join(dir, 'local'),
    available: () => active,
  });
  t.after(() => {
    service.close();
    jobs.close();
    db.$client.close();
  });
  const source = await service.addSource({ url: 'https://example.com/versioned.git' });
  const entry = async () => (await service.state()).sources[0]?.modules[0];
  assert.equal((await entry())?.hubCompatible, true);
  assert.deepEqual((await entry())?.missingRequires, []);
  assert.deepEqual((await entry())?.activeOptional, []);
  active = ['audio'];
  assert.deepEqual((await entry())?.missingRequires, ['clock']);
  await assert.rejects(() => service.installModule({ sourceId: source.id, name: module.name }), /required modules/);
  assert.equal((await service.state()).pendingApply, false);
  active.push('clock', 'mail');
  assert.deepEqual((await entry())?.activeOptional, ['mail']);
  minimum = '2.0.0';
  await writeFakeRepo(join(reposDir, source.id), { modules: [{ ...module, minHubVersion: minimum }] });
  assert.equal((await entry())?.hubCompatible, false);
  await assert.rejects(() => service.installModule({ sourceId: source.id, name: module.name }), /Hub version/);
  minimum = '0.9.0';
  await writeFakeRepo(join(reposDir, source.id), { modules: [{ ...module, minHubVersion: minimum }] });
  await service.installModule({ sourceId: source.id, name: module.name });
  const before = await service.state();
  active = ['mail'];
  await assert.rejects(() => service.updateModule({ name: module.name }), /required modules/);
  assert.deepEqual((await entry())?.missingRequires, ['audio', 'clock']);
  active = ['audio', 'clock', 'mail'];
  minimum = '>=2.0.0';
  await writeFakeRepo(join(reposDir, source.id), { modules: [{ ...module, minHubVersion: minimum }] });
  await assert.rejects(() => service.updateModule({ name: module.name }), /Hub version/);
  assert.deepEqual((await service.state()).installed, before.installed);
  assert.equal((await service.state()).pendingApply, before.pendingApply);
});
