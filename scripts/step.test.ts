import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { claimPlanRow, discoverRepos, parsePlanRow, repoStatus } from './step.ts';
import { moduleImportViolation } from './module-imports.ts';

const readme = `# Plans

## Active flow (single source of truth)

| Order | Step | File | What | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | 116 | \`116-cache.md\` | Cache | none | done |
| 2 | 117 | \`117-start.md\` | Start \\| inspect | none | planned |

## Archive

| Order | Step | File | Status |
| 1 | 117 | \`117-old.md\` | done |
`;

function fixture(t: TestContext) {
  const base = mkdtempSync(join(tmpdir(), 'hub-step-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'hub');
  const options = { root, privateRoot: join(root, 'private'), reposRoot: join(root, 'catalogs') };
  const repos = [
    { name: 'hub', path: root },
    { name: 'hub-plans', path: join(root, 'plans') },
    { name: 'hub-local', path: options.privateRoot },
    { name: 'shared', path: join(options.reposRoot, 'shared') },
  ];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (path: string, ...args: string[]) =>
    execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const remotes = repos.map((repo) => {
    const remote = join(base, `${repo.name}.git`);
    mkdirSync(repo.path, { recursive: true });
    git(base, 'init', '--bare', '--quiet', '-b', 'main', remote);
    git(repo.path, 'init', '--quiet', '-b', 'main');
    git(repo.path, 'config', 'user.name', 'Test User');
    git(repo.path, 'config', 'user.email', 'test@example.org');
    git(repo.path, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(repo.path, 'tracked.txt'), 'original\n');
    writeFileSync(join(repo.path, 'other.txt'), 'other\n');
    if (repo.name === 'hub') writeFileSync(join(root, '.gitignore'), 'plans/\nprivate/\ncatalogs/\n');
    if (repo.name === 'hub-plans') {
      writeFileSync(join(repo.path, 'README.md'), readme);
      writeFileSync(join(repo.path, '117-start.md'), '# Step 117\n');
    }
    git(repo.path, 'add', '-A');
    git(repo.path, 'commit', '--quiet', '-m', 'Initial fixture');
    git(repo.path, 'remote', 'add', 'origin', remote);
    git(repo.path, 'push', '--quiet', '-u', 'origin', 'main');
    return remote;
  });
  const run = (...args: string[]) => {
    const code = `import { runStep } from ${JSON.stringify(new URL('./step.ts', import.meta.url).href)};
try { console.log(runStep(${JSON.stringify(args)}, ${JSON.stringify(options)})); }
catch (error) { console.error(error.message); process.exitCode = 1; }`;
    return spawnSync(process.execPath, ['--input-type=module', '--eval', code], { env, encoding: 'utf8' });
  };
  return { base, options, repos, remotes, env, git, run, plans: repos[1] };
}

void test('discoverRepos orders supported repositories and skips missing/non-git directories', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.options.reposRoot, 'ignored'));
  mkdirSync(join(f.options.reposRoot, 'alpha/.git'), { recursive: true });
  assert.deepEqual(
    discoverRepos(f.options).map((repo) => repo.name),
    ['hub', 'hub-plans', 'hub-local', 'alpha', 'shared'],
  );
  assert.deepEqual(
    discoverRepos({
      root: f.options.root,
      privateRoot: join(f.base, 'missing'),
      reposRoot: join(f.base, 'missing'),
    }).map((repo) => repo.name),
    ['hub', 'hub-plans'],
  );
  assert.equal(
    moduleImportViolation('scripts/step.ts', readFileSync(new URL('./step.ts', import.meta.url), 'utf8')),
    false,
  );
});

void test('claimPlanRow changes only the target active Status cell and keeps other lines intact', () => {
  const claimed = claimPlanRow(readme, '117', 'Codex', '2026-11-26');
  assert.equal(claimed, readme.replace('| none | planned |', '| none | taken by Codex, 2026-11-26 |'));
  assert.equal(parsePlanRow(claimed, '117').file, '117-start.md');
  assert.equal(parsePlanRow(claimed, '116').status, 'done');
  assert.equal(parsePlanRow(claimPlanRow(readme, '117', '$&', '2026-11-26'), '117').status, 'taken by $&, 2026-11-26');
  assert.throws(() => claimPlanRow(claimed, '117', 'Other', '2026-11-26'), /already claimed/);
  assert.throws(() => claimPlanRow(readme, '999', 'Codex', '2026-11-26'), /not found/);
  for (const name of ['', 'Bad\nname', 'Bad|name']) {
    assert.throws(() => claimPlanRow(readme, '117', name, '2026-11-26'), /Invalid claimer/);
  }
  assert.throws(() => parsePlanRow(readme.replace('`117-start.md`', '`../outside.md`'), '117'), /Invalid plan row/);
  assert.equal(
    claimPlanRow(readme.replace('| planned |', '|   |'), '117', 'Codex', '2026-11-26'),
    readme.replace('| planned |', '| taken by Codex, 2026-11-26 |'),
  );
});

void test('repoStatus counts staged/unstaged/untracked entries including renames and unusual filenames', (t) => {
  const f = fixture(t);
  const repo = f.repos[2];
  const originalHead = f.git(repo.path, 'rev-parse', '--short', 'HEAD');
  f.git(repo.path, 'mv', 'tracked.txt', 'renamed\nfile.txt');
  writeFileSync(join(repo.path, 'other.txt'), 'staged\n');
  f.git(repo.path, 'add', 'other.txt');
  writeFileSync(join(repo.path, 'other.txt'), 'unstaged\n');
  writeFileSync(join(repo.path, 'new\nfile.txt'), 'untracked\n');
  assert.deepEqual(repoStatus(repo), {
    name: 'hub-local',
    branch: 'main',
    head: originalHead,
    ahead: 0,
    behind: 0,
    staged: 2,
    unstaged: 1,
    untracked: 1,
    clean: false,
  });
});

void test('step start refuses a dirty sibling before any pull or README change', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.repos[2].path, 'tracked.txt'), 'pending work\n');
  const before = f.git(f.plans.path, 'rev-parse', 'HEAD');
  const result = f.run('start', '117', 'Codex');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Dirty repositories; nothing pulled or claimed:/);
  assert.match(result.stderr, /hub-local .* staged=0 unstaged=1 untracked=0/);
  assert.equal(readFileSync(join(f.plans.path, 'README.md'), 'utf8'), readme);
  assert.equal(f.git(f.plans.path, 'rev-parse', 'HEAD'), before);
  for (const repo of f.repos) assert.equal(existsSync(join(repo.path, '.git/FETCH_HEAD')), false);
});

void test('repoStatus reports ahead and behind from local upstream tracking refs', (t) => {
  const f = fixture(t);
  const ahead = f.repos[0];
  f.git(ahead.path, 'commit', '--quiet', '--allow-empty', '-m', 'Local fixture commit');
  assert.equal(repoStatus(ahead).ahead, 1);
  assert.equal(repoStatus(ahead).behind, 0);
  const behind = f.repos[2];
  const head = f.git(behind.path, 'rev-parse', 'HEAD');
  f.git(behind.path, 'commit', '--quiet', '--allow-empty', '-m', 'Upstream fixture commit');
  f.git(behind.path, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  f.git(behind.path, 'update-ref', 'refs/heads/main', head);
  assert.equal(repoStatus(behind).ahead, 0);
  assert.equal(repoStatus(behind).behind, 1);
  assert.equal(repoStatus(behind).clean, true);
});

void test('step start pulls every repository and pushes only the plan claim without trailers', (t) => {
  const f = fixture(t);
  for (const [index, repo] of f.repos.entries()) {
    const peer = join(f.base, `peer-${index}`);
    f.git(f.base, 'clone', '--quiet', f.remotes[index], peer);
    f.git(peer, 'config', 'user.name', 'Test User');
    f.git(peer, 'config', 'user.email', 'test@example.org');
    f.git(peer, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(peer, 'synced.txt'), repo.name);
    f.git(peer, 'add', 'synced.txt');
    f.git(peer, 'commit', '--quiet', '-m', 'Remote fixture change');
    f.git(peer, 'push', '--quiet');
  }
  const result = f.run('start', '117', 'Codex');
  assert.equal(result.status, 0, result.stderr);
  const date = new Date().toISOString().slice(0, 10);
  assert.equal(readFileSync(join(f.plans.path, 'README.md'), 'utf8'), claimPlanRow(readme, '117', 'Codex', date));
  assert.equal(f.git(f.plans.path, 'log', '-1', '--format=%B'), 'chore(plans): claim step 117 for Codex');
  assert.equal(f.git(f.plans.path, 'rev-parse', 'HEAD'), f.git(f.remotes[1], 'rev-parse', 'refs/heads/main'));
  assert.equal(f.git(f.plans.path, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), 'README.md');
  for (const repo of f.repos) {
    assert.equal(readFileSync(join(repo.path, 'synced.txt'), 'utf8'), repo.name);
    assert.equal(repoStatus(repo).clean, true);
    assert.ok(
      result.stdout.includes(
        `${repo.name} main ${f.git(repo.path, 'rev-parse', '--short', 'HEAD')} ahead=0 behind=0 clean`,
      ),
    );
  }
  assert.ok(result.stdout.includes('plan: plans/117-start.md'));
  assert.ok(result.stdout.includes(`status: taken by Codex, ${date}`));
});

void test('step status stays offline and reports exact counts for all repositories', (t) => {
  const f = fixture(t);
  const local = f.repos[2];
  writeFileSync(join(local.path, 'tracked.txt'), 'staged\n');
  f.git(local.path, 'add', 'tracked.txt');
  writeFileSync(join(local.path, 'other.txt'), 'unstaged\n');
  writeFileSync(join(local.path, 'new.txt'), 'untracked\n');
  for (const repo of f.repos) f.git(repo.path, 'remote', 'set-url', 'origin', join(f.base, 'unreachable.git'));
  const result = f.run('status');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.stdout.trim().split('\n'),
    f.repos.map((repo) => {
      const counts = repo.name === 'hub-local' ? 'staged=1 unstaged=1 untracked=1' : 'clean';
      return `${repo.name} main ${f.git(repo.path, 'rev-parse', '--short', 'HEAD')} ahead=0 behind=0 ${counts}`;
    }),
  );
  for (const repo of f.repos) assert.equal(existsSync(join(repo.path, '.git/FETCH_HEAD')), false);
});

void test('step start without a claimer syncs and prints the plan without claiming', (t) => {
  const f = fixture(t);
  const before = f.git(f.plans.path, 'rev-parse', 'HEAD');
  const result = f.run('start', '117');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('status: planned'));
  assert.equal(f.git(f.plans.path, 'rev-parse', 'HEAD'), before);
  assert.equal(readFileSync(join(f.plans.path, 'README.md'), 'utf8'), readme);
});

void test('step start stops on pull failure and does not claim', (t) => {
  const f = fixture(t);
  f.git(f.options.root, 'remote', 'set-url', 'origin', join(f.base, 'unreachable.git'));
  const result = f.run('start', '117', 'Codex');
  assert.equal(result.status, 1);
  assert.equal(readFileSync(join(f.plans.path, 'README.md'), 'utf8'), readme);
  assert.equal(existsSync(join(f.plans.path, '.git/FETCH_HEAD')), false);
});

void test('step start reports a failed claim push and keeps the local claim for retry', (t) => {
  const f = fixture(t);
  const remoteHead = f.git(f.remotes[1], 'rev-parse', 'refs/heads/main');
  f.git(f.plans.path, 'remote', 'set-url', '--push', 'origin', join(f.base, 'unreachable.git'));
  const result = f.run('start', '117', 'Codex');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Claim committed locally; push failed/);
  assert.match(result.stderr, /git -C plans push before starting work/);
  assert.equal(f.git(f.remotes[1], 'rev-parse', 'refs/heads/main'), remoteHead);
  assert.equal(repoStatus(f.plans).ahead, 1);
  assert.equal(repoStatus(f.plans).clean, true);
});

void test('CLI rejects invalid arguments with exit 1 before repository access', () => {
  for (const args of [[], ['other'], ['start'], ['start', '../117'], ['status', 'extra']]) {
    const result = spawnSync(process.execPath, [new URL('./step.ts', import.meta.url).pathname, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: step.ts status/);
    assert.equal(result.stdout, '');
  }
});

void test('step start rejects missing plan files, unknown steps and existing claims', (t) => {
  const f = fixture(t);
  assert.equal(f.run('start', '999', 'Codex').status, 1);
  rmSync(join(f.plans.path, '117-start.md'));
  f.git(f.plans.path, 'add', '-A');
  f.git(f.plans.path, 'commit', '--quiet', '-m', 'Remove fixture plan');
  const missing = f.run('start', '117', 'Codex');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Plan file missing/);
  writeFileSync(join(f.plans.path, '117-start.md'), '# Restored\n');
  const claimed = claimPlanRow(readme, '117', 'Other', '2026-11-26');
  writeFileSync(join(f.plans.path, 'README.md'), claimed);
  f.git(f.plans.path, 'add', '-A');
  f.git(f.plans.path, 'commit', '--quiet', '-m', 'Existing fixture claim');
  const existing = f.run('start', '117', 'Codex');
  assert.equal(existing.status, 1);
  assert.match(existing.stderr, /already claimed/);
  assert.equal(readFileSync(join(f.plans.path, 'README.md'), 'utf8'), claimed);
});
