// Remembers the tree a green `pnpm verify` tested, so the pre-commit hook can skip a second full run on the same code.
// `tree`: prints the worktree tree hash (`git write-tree` in a scratch index).
// `write [expectedTree]`: stores the verified tree hash, refusing if the worktree changed since `expectedTree`.
// `check` (in the hook): exit 0 only if the index being committed is exactly that tree.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const git = (args: string[], cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env });

const gitPath = (name: string, cwd = process.cwd()) => resolve(cwd, git(['rev-parse', '--git-path', name], cwd).trim());

export function worktreeTree(cwd = process.cwd()) {
  // A scratch index, seeded from the real one for its stat cache, so the real index is never touched.
  const index = resolve(cwd, process.env.GIT_INDEX_FILE ?? git(['rev-parse', '--git-path', 'index'], cwd).trim());
  const scratch = `${gitPath('hub-verified-tree', cwd)}.${randomUUID()}.index`;
  if (existsSync(index)) copyFileSync(index, scratch);
  const env = { ...process.env, GIT_INDEX_FILE: scratch };
  try {
    git(['add', '-A'], cwd, env);
    return git(['write-tree'], cwd, env).trim();
  } finally {
    rmSync(scratch, { force: true });
  }
}

export function combineHashes(...parts: string[]) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(`${Buffer.byteLength(part)}:`).update(part);
  return hash.digest('hex');
}

export function filteredTreeHash(treeHash: string, exclude: (path: string) => boolean, cwd = process.cwd()) {
  const entries = git(['ls-tree', '-r', '-z', treeHash], cwd)
    .split('\0')
    .filter((entry) => entry && !exclude(entry.slice(entry.indexOf('\t') + 1)))
    .toSorted();
  return combineHashes(...entries);
}

export function hubE2eTreeHash(cwd = process.cwd()) {
  return filteredTreeHash(worktreeTree(cwd), (path) => path.startsWith('docs/') || path.endsWith('.md'), cwd);
}

export function hubPrivateRuntimeHash(cwd = process.cwd()) {
  return filteredTreeHash(
    worktreeTree(cwd),
    (path) =>
      path.startsWith('docs/') ||
      path.endsWith('.md') ||
      path.startsWith('modules.example/') ||
      path.startsWith('apps/e2e/__screenshots__/') ||
      (path.startsWith('apps/e2e/tests/') && path.endsWith('.spec.ts')),
    cwd,
  );
}

export function hashDirectory(dir: string) {
  const hash = createHash('sha256');
  function walk(folder: string, prefix: string) {
    for (const entry of readdirSync(folder, { withFileTypes: true }).toSorted((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === '.git')) continue;
      const path = join(folder, entry.name);
      const relative = `${prefix}${entry.name}`;
      const kind = entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'dir' : 'file';
      hash.update(combineHashes(kind, relative));
      if (entry.isDirectory()) walk(path, `${relative}/`);
      else {
        const bytes = entry.isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path);
        hash.update(`${bytes.length}:`).update(bytes);
      }
    }
  }
  walk(dir, '');
  return hash.digest('hex');
}

export const stampsPath = (cwd = process.cwd()) => gitPath('hub-pass-stamps.json', cwd);

export function readPassStamps(path: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export function hasPassStamp(path: string, key: string, hash: string) {
  return process.env.HUB_VERIFY_NO_CACHE !== '1' && readPassStamps(path)[key] === hash;
}

export function writePassStamp(path: string, key: string, hash: string) {
  const temporary = `${path}.${randomUUID()}`;
  try {
    writeFileSync(temporary, JSON.stringify({ ...readPassStamps(path), [key]: hash }));
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function main() {
  const stampPath = gitPath('hub-verified-tree');
  const mode = process.argv[2];
  if (mode === 'tree') {
    process.stdout.write(`${worktreeTree()}\n`);
  } else if (mode === 'write') {
    const expectedTree = process.argv[3];
    const currentTree = worktreeTree();
    if (expectedTree && currentTree !== expectedTree) {
      process.stderr.write('verify-stamp: worktree changed during verify; refusing to write stamp\n');
      process.exit(1);
    }
    writeFileSync(stampPath, `${currentTree}\n`);
  } else if (mode === 'check') {
    const verified = existsSync(stampPath) ? readFileSync(stampPath, 'utf8').trim() : '';
    process.exit(verified !== '' && verified === git(['write-tree']).trim() ? 0 : 1);
  } else {
    console.error('usage: verify-stamp.ts tree|write [expectedTree]|check');
    process.exit(2);
  }
}

if (import.meta.main) main();
