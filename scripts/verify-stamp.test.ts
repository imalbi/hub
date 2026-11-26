import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  combineHashes,
  filteredTreeHash,
  hashDirectory,
  hasPassStamp,
  hubE2eTreeHash,
  hubPrivateRuntimeHash,
  readPassStamps,
  worktreeTree,
  writePassStamp,
} from './verify-stamp.ts';
import { privateE2eInputHash, privateE2eStampKey } from './test-e2e-private.ts';

const script = fileURLToPath(new URL('./verify-stamp.ts', import.meta.url));

// Without GIT_* variables, so a run from inside a hook never reaches the real repository.
function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function repository(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'hub-stamp-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, env: cleanEnv(), encoding: 'utf8' });
  git('init', '--quiet');
  writeFileSync(join(directory, '.gitignore'), 'ignored/\n');
  writeFileSync(join(directory, 'a.txt'), 'one\n');
  git('add', '-A');
  // `check` runs inside the pre-commit hook, where git points GIT_INDEX_FILE at the index being committed.
  const stamp = (mode: 'tree' | 'write' | 'check', ...extra: string[]) =>
    spawnSync(process.execPath, [script, mode, ...extra], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...cleanEnv(), ...(mode === 'check' ? { GIT_INDEX_FILE: join(directory, '.git', 'index') } : {}) },
    });
  return { directory, git, stamp };
}

void test('a commit of exactly the verified tree is recognised', (t) => {
  const repo = repository(t);
  assert.equal(repo.stamp('write').status, 0);
  assert.equal(repo.stamp('check').status, 0);
});

void test('without a stamp the check fails, so the hook runs the full gate', (t) => {
  const repo = repository(t);
  assert.equal(repo.stamp('check').status, 1);
});

void test('any staged change after the verify invalidates the stamp', (t) => {
  const repo = repository(t);
  repo.stamp('write');
  writeFileSync(join(repo.directory, 'a.txt'), 'two\n');
  repo.git('add', 'a.txt');
  assert.equal(repo.stamp('check').status, 1);
});

void test('the stamp covers unstaged and untracked files present at verify time, not only the index', (t) => {
  const repo = repository(t);
  writeFileSync(join(repo.directory, 'b.txt'), 'new\n');
  repo.stamp('write');
  // The verified tree had b.txt; an index without it is not what was tested.
  assert.equal(repo.stamp('check').status, 1);
  repo.git('add', 'b.txt');
  assert.equal(repo.stamp('check').status, 0);
});

void test('ignored files do not count', (t) => {
  const repo = repository(t);
  repo.stamp('write');
  mkdirSync(join(repo.directory, 'ignored'));
  writeFileSync(join(repo.directory, 'ignored', 'x.txt'), 'x\n');
  assert.equal(repo.stamp('check').status, 0);
});

void test('writing the stamp leaves the real index untouched', (t) => {
  const repo = repository(t);
  writeFileSync(join(repo.directory, 'b.txt'), 'new\n');
  const before = repo.git('status', '--porcelain');
  repo.stamp('write');
  assert.equal(repo.git('status', '--porcelain'), before);
  assert.match(before, /\?\? b\.txt/);
});

void test('G4: write refuses to write stamp when worktree drifted after start tree snapshot', (t) => {
  const repo = repository(t);
  const startTree = repo.stamp('tree');
  assert.equal(startTree.status, 0);
  const expected = startTree.stdout.trim();
  assert.ok(expected.length > 0);

  writeFileSync(join(repo.directory, 'a.txt'), 'edited mid-verify\n');
  const refused = repo.stamp('write', expected);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /worktree changed during verify/);
  assert.equal(repo.stamp('check').status, 1);
});

void test('directory hashes cover paths, bytes and symlink targets but ignore dependency and git folders', (t) => {
  const { directory } = repository(t);
  const hash = () => hashDirectory(directory);
  const initial = hash();
  mkdirSync(join(directory, 'node_modules'));
  writeFileSync(join(directory, 'node_modules', 'dependency'), 'ignored');
  writeFileSync(join(directory, '.git', 'ignored'), 'ignored');
  assert.equal(hash(), initial);
  writeFileSync(join(directory, 'a.txt'), 'two');
  assert.notEqual(hash(), initial);
  const edited = hash();
  renameSync(join(directory, 'a.txt'), join(directory, 'b.txt'));
  assert.notEqual(hash(), edited);
  symlinkSync('b.txt', join(directory, 'link'));
  const linked = hash();
  rmSync(join(directory, 'link'));
  symlinkSync('missing', join(directory, 'link'));
  assert.notEqual(hash(), linked);
});

void test('private runtime filtering retains public modules and shared e2e helpers', (t) => {
  const { directory } = repository(t);
  const put = (path: string, value: string) => {
    const full = join(directory, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, value);
  };
  const hash = () => hubPrivateRuntimeHash(directory);
  const initial = hash();
  for (const path of [
    'README.md',
    'docs/guide.txt',
    'modules.example/hello/server.ts',
    'apps/e2e/tests/desk.spec.ts',
    'apps/e2e/__screenshots__/desk.png',
  ]) {
    put(path, 'ignored');
    assert.equal(hash(), initial, path);
  }
  for (const path of [
    'apps/e2e/tests/hosts.ts',
    'apps/e2e/tests/pair.setup.ts',
    'apps/web/src/modules/calendar/page.tsx',
  ]) {
    const before = hash();
    put(path, 'runtime');
    assert.notEqual(hash(), before, path);
  }
  const publicHash = hubE2eTreeHash(directory);
  put('apps/e2e/tests/desk.spec.ts', 'changed spec');
  assert.notEqual(hubE2eTreeHash(directory), publicHash);
  const tree = worktreeTree(directory);
  assert.equal(
    filteredTreeHash(tree, () => false, directory),
    filteredTreeHash(tree, () => false, directory),
  );
});

void test('pass stamps tolerate missing/corrupt data, preserve keys and bypass reads while refreshing writes', (t) => {
  const { directory } = repository(t);
  const path = join(directory, '.git', 'passes.json');
  assert.deepEqual(readPassStamps(path), {});
  for (const value of ['broken', 'null', '[]', '123']) {
    writeFileSync(path, value);
    assert.deepEqual(readPassStamps(path), {});
  }
  const previous = process.env.HUB_VERIFY_NO_CACHE;
  t.after(() => {
    if (previous === undefined) delete process.env.HUB_VERIFY_NO_CACHE;
    else process.env.HUB_VERIFY_NO_CACHE = previous;
  });
  process.env.HUB_VERIFY_NO_CACHE = '0';
  writePassStamp(path, 'one', 'first');
  writePassStamp(path, 'two', 'second');
  assert.ok(hasPassStamp(path, 'one', 'first'));
  assert.ok(!hasPassStamp(path, 'one', 'wrong'));
  process.env.HUB_VERIFY_NO_CACHE = '1';
  assert.ok(!hasPassStamp(path, 'one', 'first'));
  writePassStamp(path, 'one', 'fresh');
  assert.deepEqual(readPassStamps(path), { one: 'fresh', two: 'second' });
});

void test('private module edits invalidate only that module and visual stamps are distinct', (t) => {
  const { directory } = repository(t);
  const a = join(directory, 'ignored', 'a');
  const b = join(directory, 'ignored', 'b');
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  writeFileSync(join(a, 'server.ts'), 'first');
  writeFileSync(join(b, 'server.ts'), 'first');
  const hashA = privateE2eInputHash(a, false, directory);
  const hashB = privateE2eInputHash(b, false, directory);
  const publicHash = hubE2eTreeHash(directory);
  writeFileSync(join(a, 'server.ts'), 'edited');
  assert.notEqual(privateE2eInputHash(a, false, directory), hashA);
  assert.equal(privateE2eInputHash(b, false, directory), hashB);
  assert.equal(hubE2eTreeHash(directory), publicHash);
  assert.notEqual(privateE2eInputHash(b, true, directory), hashB);
  const path = join(directory, '.git', 'passes.json');
  writePassStamp(path, privateE2eStampKey('a', true), hashA);
  assert.ok(!hasPassStamp(path, privateE2eStampKey('a', false), hashA));
  assert.notEqual(combineHashes('ab', 'c'), combineHashes('a', 'bc'));
});
