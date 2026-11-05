import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./guard-private.ts', import.meta.url));
/** The test's environment without GIT_* variables, so every fixture command acts on its own temp repository. */
function isolatedEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}
const privatePath = ['', 'home', 'sample', 'Documents'].join('/');

function repository(t: { after: (fn: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'hub-guard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', directory], { env: isolatedEnv() });
  function stage(file: string, contents: string | Buffer) {
    writeFileSync(join(directory, file), contents);
    execFileSync('git', ['add', '--', file], { cwd: directory, env: isolatedEnv() });
  }
  function guard(args: string[] = [], extraEnv: Record<string, string> = {}) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...isolatedEnv(), HUB_GUARD_STAGED: '', ...extraEnv },
    });
  }
  return { directory, stage, guard };
}

// Git runs hooks with GIT_DIR and GIT_INDEX_FILE set (absolute in a linked worktree). Inherited by these fixtures,
// `git init` once marked the real repository bare and `git add` staged fixture files into its index.
void test('fixture repositories ignore the git variables a hook exports', (t) => {
  const decoy = mkdtempSync(join(tmpdir(), 'hub-guard-decoy-'));
  t.after(() => rmSync(decoy, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', decoy], { env: isolatedEnv() });
  const saved = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
  process.env.GIT_DIR = join(decoy, '.git');
  process.env.GIT_INDEX_FILE = join(decoy, '.git', 'index');
  try {
    const repo = repository(t);
    repo.stage('sample.txt', 'safe\n');
    assert.equal(repo.guard(['--staged']).status, 0);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const run = (args: string[]) => execFileSync('git', args, { cwd: decoy, encoding: 'utf8', env: isolatedEnv() });
  assert.equal(run(['config', '--get', 'core.bare']).trim(), 'false');
  assert.equal(run(['ls-files']), '');
});

void test('staged mode scans the index, while normal mode scans tracked worktree content', (t) => {
  const repo = repository(t);
  repo.stage('sample.txt', 'safe\n');
  writeFileSync(join(repo.directory, 'sample.txt'), privatePath);
  assert.equal(repo.guard(['--staged']).status, 0);
  const dirty = repo.guard();
  assert.equal(dirty.status, 1);
  assert.match(dirty.stdout, /sample\.txt.*home-path/);
  assert.equal(dirty.stdout.includes(privatePath), false);

  repo.stage('sample.txt', privatePath);
  writeFileSync(join(repo.directory, 'sample.txt'), 'safe\n');
  assert.equal(repo.guard().status, 0);
  assert.equal(repo.guard(['--staged']).status, 1);
});

void test('the hook environment chooses staged content even when verify has no CLI flag', (t) => {
  const repo = repository(t);
  repo.stage('sample.txt', privatePath);
  writeFileSync(join(repo.directory, 'sample.txt'), 'safe\n');
  assert.equal(repo.guard([], { HUB_GUARD_STAGED: '1' }).status, 1);
});

void test('untracked files and unstaged deletions do not cause reads or false failures', (t) => {
  const repo = repository(t);
  repo.stage('sample.txt', 'safe\n');
  unlinkSync(join(repo.directory, 'sample.txt'));
  writeFileSync(join(repo.directory, 'untracked.txt'), privatePath);
  assert.equal(repo.guard().status, 0);
  assert.equal(repo.guard(['--staged']).status, 0);
});

void test('binary blobs and names containing spaces work in both modes', (t) => {
  const repo = repository(t);
  repo.stage('image data.bin', Buffer.concat([Buffer.from(privatePath), Buffer.from([0])]));
  assert.equal(repo.guard().status, 0);
  assert.equal(repo.guard(['--staged']).status, 0);
  repo.stage('source with spaces.txt', privatePath);
  assert.equal(repo.guard().status, 1);
  assert.equal(repo.guard(['--staged']).status, 1);
});

void test('private-word diagnostics never print the private word list', (t) => {
  const repo = repository(t);
  repo.stage('sample.txt', 'The Sample Person is here.');
  const missing = repo.guard();
  assert.equal(missing.status, 0);
  assert.match(missing.stdout, /no private word list/i);
  writeFileSync(join(repo.directory, '.private-words'), '# local only\nSample Person\n');
  const result = repo.guard();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /private-word/);
  assert.equal((result.stdout + result.stderr).includes('Sample Person'), false);
});

void test('secret/config files accidentally tracked are reported without scanning their contents', (t) => {
  const repo = repository(t);
  for (const file of ['config.local.json', '.env', '.env.production', '.private-words']) {
    repo.stage(file, privatePath);
  }
  for (const args of [[], ['--staged']]) {
    const result = repo.guard(args);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /forbidden-file/);
    assert.doesNotMatch(result.stdout, /home-path/);
    assert.equal((result.stdout + result.stderr).includes(privatePath), false);
  }
});

void test('symlinks are scanned as link text and never followed into personal data', (t) => {
  const repo = repository(t);
  writeFileSync(join(repo.directory, 'private-data'), privatePath);
  symlinkSync('private-data', join(repo.directory, 'linked.txt'));
  execFileSync('git', ['add', '--', 'linked.txt'], { cwd: repo.directory, env: isolatedEnv() });
  assert.equal(repo.guard().status, 0);
  assert.equal(repo.guard(['--staged']).status, 0);
});

void test('a symlinked parent directory is refused without scanning the external file', (t) => {
  const repo = repository(t);
  mkdirSync(join(repo.directory, 'docs'));
  repo.stage('docs/notes.txt', 'safe\n');
  const outside = mkdtempSync(join(tmpdir(), 'hub-guard-external-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'notes.txt'), privatePath);
  rmSync(join(repo.directory, 'docs'), { recursive: true });
  symlinkSync(outside, join(repo.directory, 'docs'));
  const result = repo.guard();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unable to read tracked content/);
  assert.doesNotMatch(result.stdout, /home-path/);
  assert.equal((result.stdout + result.stderr).includes(privatePath), false);
  assert.equal(repo.guard(['--staged']).status, 0);
});

void test('tracked file read errors fail closed without printing source contents', (t) => {
  const repo = repository(t);
  repo.stage('sample.txt', 'safe\n');
  unlinkSync(join(repo.directory, 'sample.txt'));
  mkdirSync(join(repo.directory, 'sample.txt'));
  const result = repo.guard();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unable to read tracked content/);
});

void test('unknown options and a directory outside git fail closed', (t) => {
  const repo = repository(t);
  assert.equal(repo.guard(['--unknown']).status, 1);
  rmSync(join(repo.directory, '.git'), { recursive: true });
  assert.equal(repo.guard().status, 1);
});
