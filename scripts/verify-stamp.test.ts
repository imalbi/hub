import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
