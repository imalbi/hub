import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateRoot, reposRoot } from '../apps/server/src/core/discovery.ts';

type Repo = { name: string; path: string };
type Roots = { root?: string; privateRoot?: string; reposRoot?: string };
const root = fileURLToPath(new URL('../', import.meta.url));

export function discoverRepos(options: Roots = {}): Repo[] {
  const base = options.root ?? root;
  const catalogs = options.reposRoot ?? reposRoot;
  const repos = [
    { name: 'hub', path: base },
    { name: 'hub-plans', path: join(base, 'plans') },
    { name: 'hub-local', path: options.privateRoot ?? privateRoot },
  ];
  if (existsSync(catalogs)) {
    for (const entry of readdirSync(catalogs, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.isDirectory()) repos.push({ name: entry.name, path: join(catalogs, entry.name) });
    }
  }
  return repos.filter((repo) => existsSync(join(repo.path, '.git')));
}

function git(repo: Repo, args: string[]) {
  return execFileSync('git', ['-C', repo.path, ...args], { encoding: 'utf8' });
}

export function repoStatus(repo: Repo) {
  const entries = git(repo, ['status', '--porcelain=v1', '-b', '-z']).split('\0');
  const header = entries.shift() ?? '';
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) continue;
    if (entry.startsWith('??')) untracked++;
    else {
      if (entry[0] !== ' ') staged++;
      if (entry[1] !== ' ') unstaged++;
      // Porcelain -z gives a rename/copy's original filename as the next entry.
      if (entry.slice(0, 2).includes('R') || entry.slice(0, 2).includes('C')) index++;
    }
  }
  return {
    name: repo.name,
    branch: header.slice(3).split('...')[0],
    head: git(repo, ['rev-parse', '--short', 'HEAD']).trim(),
    ahead: Number(/ahead (\d+)/.exec(header)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(header)?.[1] ?? 0),
    staged,
    unstaged,
    untracked,
    clean: staged + unstaged + untracked === 0,
  };
}

export function parsePlanRow(readme: string, stepId: string) {
  let active = false;
  let columns: string[] = [];
  const lines = readme.split('\n');
  for (const [lineIndex, line] of lines.entries()) {
    if (line.startsWith('## ')) {
      active = /^## Active flow\b/.test(line);
      columns = [];
    }
    if (!active || !line.startsWith('|')) continue;
    const cells = line.split(/(?<!\\)\|/);
    const values = cells.map((cell) => cell.trim());
    if (values.includes('Step') && values.includes('Status')) {
      columns = values;
      continue;
    }
    if (!columns.length || values[columns.indexOf('Step')] !== stepId) continue;
    const file = /^`([a-z\d][a-z\d._-]*\.md)`$/i.exec(values[columns.indexOf('File')])?.[1];
    const statusIndex = columns.indexOf('Status');
    if (!file || statusIndex < 0 || values[statusIndex] === undefined) {
      throw new Error(`Invalid plan row for step ${stepId}`);
    }
    return { file, status: values[statusIndex], lineIndex, statusIndex, cells };
  }
  throw new Error(`Step ${stepId} not found in Active flow`);
}

export function claimPlanRow(readme: string, stepId: string, claimer: string, date: string) {
  if (!claimer.trim() || /[|\r\n]/.test(claimer) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid claimer or claim date');
  }
  const row = parsePlanRow(readme, stepId);
  if (/taken by/i.test(row.status)) throw new Error(`Step ${stepId} already claimed: ${row.status}`);
  const lines = readme.split('\n');
  const cell = row.cells[row.statusIndex];
  row.cells[row.statusIndex] = cell.trim()
    ? cell.replace(/\S(?:.*\S)?/, () => `taken by ${claimer.trim()}, ${date}`)
    : ` taken by ${claimer.trim()}, ${date} `;
  lines[row.lineIndex] = row.cells.join('|');
  return lines.join('\n');
}

function statusLine(status: ReturnType<typeof repoStatus>) {
  const counts = status.clean
    ? 'clean'
    : `staged=${status.staged} unstaged=${status.unstaged} untracked=${status.untracked}`;
  return `${status.name} ${status.branch} ${status.head} ahead=${status.ahead} behind=${status.behind} ${counts}`;
}

export function runStep(args: string[], options: Roots = {}) {
  const [command, stepId, claimer] = args;
  if (
    (command !== 'status' && command !== 'start') ||
    (command === 'status' && args.length !== 1) ||
    (command === 'start' && (!stepId || !/^\d+$/.test(stepId) || args.length > 3))
  ) {
    throw new Error('Usage: step.ts status | start <step> [claimer]');
  }
  const repos = discoverRepos(options);
  if (command === 'status') return repos.map((repo) => statusLine(repoStatus(repo))).join('\n');
  const dirty = repos.map(repoStatus).filter((status) => !status.clean);
  if (dirty.length)
    throw new Error(`Dirty repositories; nothing pulled or claimed:\n${dirty.map(statusLine).join('\n')}`);
  for (const repo of repos) git(repo, ['pull', '--rebase']);
  const plans = repos.find((repo) => repo.name === 'hub-plans');
  if (!plans) throw new Error('Plans repository not found');
  const readmePath = join(plans.path, 'README.md');
  let readme = readFileSync(readmePath, 'utf8');
  let row = parsePlanRow(readme, stepId);
  if (!existsSync(join(plans.path, row.file))) throw new Error(`Plan file missing: plans/${row.file}`);
  if (claimer !== undefined) {
    readme = claimPlanRow(readme, stepId, claimer, new Date().toISOString().slice(0, 10));
    writeFileSync(readmePath, readme);
    git(plans, ['add', 'README.md']);
    git(plans, ['commit', '-m', `chore(plans): claim step ${stepId} for ${claimer.trim()}`]);
    try {
      git(plans, ['push']);
    } catch (error) {
      throw new Error('Claim committed locally; push failed. Run git -C plans push before starting work.', {
        cause: error,
      });
    }
    row = parsePlanRow(readme, stepId);
  }
  return [
    ...repos.map((repo) => statusLine(repoStatus(repo))),
    `plan: plans/${row.file}`,
    `status: ${row.status}`,
  ].join('\n');
}

if (import.meta.main) {
  try {
    process.stdout.write(`${runStep(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
