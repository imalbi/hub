import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { scanCommitMessage, scanCommitRange } from './guard-commits.ts';

function isolatedEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

const repoScriptsDir = fileURLToPath(new URL('.', import.meta.url));
const repoHooksDir = fileURLToPath(new URL('../.githooks', import.meta.url));

function setupHookRepo(t: { after: (fn: () => void) => void }, withRemote = false) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-hooks-test-'));
  const remoteDir = withRemote ? mkdtempSync(join(tmpdir(), 'hub-hooks-remote-')) : '';
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (remoteDir) rmSync(remoteDir, { recursive: true, force: true });
  });

  const env = isolatedEnv();
  const git = (args: string[], options: { input?: string; allowFail?: boolean } = {}) => {
    const res = spawnSync('git', args, {
      cwd: dir,
      env,
      encoding: 'utf8',
      input: options.input,
    });
    if (!options.allowFail && res.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed (${res.status}): ${res.stdout}${res.stderr}`);
    }
    return res;
  };

  git(['init', '--quiet', '-b', 'main']);
  git(['config', 'user.name', 'Test User']);
  git(['config', 'user.email', 'test@example.org']);

  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, '.githooks'), { recursive: true });
  for (const file of [
    'private-scanner.ts',
    'guard-private.ts',
    'guard-modules.ts',
    'guard-commits.ts',
    'module-imports.ts',
    'verify-stamp.ts',
  ]) {
    copyFileSync(join(repoScriptsDir, file), join(dir, 'scripts', file));
  }
  for (const hook of ['commit-msg', 'pre-commit', 'pre-push']) {
    const dest = join(dir, '.githooks', hook);
    copyFileSync(join(repoHooksDir, hook), dest);
    chmodSync(dest, 0o755);
  }
  writeFileSync(
    join(dir, '.gitignore'),
    'node_modules/\npnpm-lock.yaml\nmodules[.]local/\nmodules[.]installed\nmodules[.]repos\n.private-words\n',
  );
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'hook-fixture',
      private: true,
      type: 'module',
      scripts: {
        guard: 'node scripts/guard-private.ts && node scripts/guard-modules.ts',
        verify: 'node scripts/verify-stamp.ts write',
      },
    }),
  );
  git(['config', 'core.hooksPath', '.githooks']);
  git(['add', '-A']);
  git(['commit', '--no-verify', '-m', 'chore: initial fixture']);

  if (remoteDir) {
    execFileSync('git', ['init', '--bare', '--quiet', remoteDir], { env });
    git(['remote', 'add', 'origin', remoteDir]);
    git(['push', '--no-verify', '-u', 'origin', 'main']);
  }

  return { dir, git, env };
}

void test('G2: commit-msg rejects private words and private emails while passing clean messages', (t) => {
  const secretEmail = ['user', 'corp.invalid'].join('@');
  const leakEmail = ['person', 'mail.invalid'].join('@');
  assert.deepEqual(scanCommitMessage(`feat: clean message\n# comment SecretName ${secretEmail}\n`, ['SecretName']), []);

  const repo = setupHookRepo(t);
  writeFileSync(join(repo.dir, '.private-words'), 'SecretProjectToken\n');
  writeFileSync(join(repo.dir, 'notes.txt'), 'clean notes\n');
  repo.git(['add', 'notes.txt']);
  execFileSync(process.execPath, [join(repo.dir, 'scripts/verify-stamp.ts'), 'write'], {
    cwd: repo.dir,
    env: repo.env,
  });

  const badEmail = repo.git(['commit', '-m', `fix: contact ${leakEmail}`], { allowFail: true });
  assert.notEqual(badEmail.status, 0);

  const badWord = repo.git(['commit', '-m', 'fix: mention SecretProjectToken'], { allowFail: true });
  assert.notEqual(badWord.status, 0);

  const clean = repo.git(['commit', '-m', 'docs: add clean notes'], { allowFail: true });
  assert.equal(clean.status, 0, `${clean.stdout}${clean.stderr}`);
});

void test('G2: pre-push scans unpushed commits for private words and emails', (t) => {
  const repo = setupHookRepo(t, true);
  writeFileSync(join(repo.dir, '.private-words'), 'HiddenVendor\n');
  writeFileSync(join(repo.dir, 'clean.txt'), 'ok\n');
  repo.git(['add', 'clean.txt']);
  repo.git(['commit', '--no-verify', '-m', 'feat: integrate HiddenVendor']);

  const findings = scanCommitRange(repo.dir, ['origin/main..HEAD'], ['HiddenVendor']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.rule, 'private-word');

  const blockedPush = repo.git(['push', 'origin', 'main'], { allowFail: true });
  assert.notEqual(blockedPush.status, 0);

  repo.git(['commit', '--amend', '--no-verify', '-m', 'feat: clean vendor adapter']);
  const cleanPush = repo.git(['push', 'origin', 'main'], { allowFail: true });
  assert.equal(cleanPush.status, 0, `${cleanPush.stdout}${cleanPush.stderr}`);
});

void test('G5: pre-commit rejects unstaged tracked edits or untracked files and allows a clean tree', (t) => {
  const repo = setupHookRepo(t);
  writeFileSync(join(repo.dir, 'code.ts'), 'export const a = 1;\n');
  repo.git(['add', 'code.ts']);
  repo.git(['commit', '--no-verify', '-m', 'add code']);

  // Stage an edit, then introduce an unstaged modification to tracked file.
  writeFileSync(join(repo.dir, 'code.ts'), 'export const a = 2;\n');
  repo.git(['add', 'code.ts']);
  writeFileSync(join(repo.dir, 'code.ts'), 'export const a = 3;\n');
  const dirtyTracked = repo.git(['commit', '-m', 'should fail with unstaged change'], { allowFail: true });
  assert.notEqual(dirtyTracked.status, 0);
  assert.match(dirtyTracked.stderr, /stage or stash unstaged\/untracked files/);

  // Re-stage so tracked matches, then add an untracked file.
  repo.git(['add', 'code.ts']);
  writeFileSync(join(repo.dir, 'scratch.tmp'), 'untracked\n');
  const dirtyUntracked = repo.git(['commit', '-m', 'should fail with untracked file'], { allowFail: true });
  assert.notEqual(dirtyUntracked.status, 0);
  assert.match(dirtyUntracked.stderr, /stage or stash unstaged\/untracked files/);

  // Remove untracked file and verify commit succeeds cleanly.
  rmSync(join(repo.dir, 'scratch.tmp'));
  const clean = repo.git(['commit', '-m', 'clean code change'], { allowFail: true });
  assert.equal(clean.status, 0, `${clean.stdout}${clean.stderr}`);
});
