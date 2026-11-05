// Remembers the tree a green `pnpm verify` tested, so the pre-commit hook can skip a second full run on the same code.
// `write` (end of verify): the worktree as a git tree, tracked and untracked files, ignored ones excluded.
// `check` (in the hook): exit 0 only if the index being committed is exactly that tree.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const git = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
  execFileSync('git', args, { encoding: 'utf8', env }).trim();

const stampPath = resolve(git(['rev-parse', '--git-path', 'hub-verified-tree']));

function worktreeTree() {
  // A scratch index, seeded from the real one for its stat cache, so the real index is never touched.
  const index = resolve(process.env.GIT_INDEX_FILE ?? git(['rev-parse', '--git-path', 'index']));
  const scratch = `${stampPath}.index`;
  if (existsSync(index)) copyFileSync(index, scratch);
  const env = { ...process.env, GIT_INDEX_FILE: scratch };
  try {
    git(['add', '-A'], env);
    return git(['write-tree'], env);
  } finally {
    rmSync(scratch, { force: true });
  }
}

const mode = process.argv[2];
if (mode === 'write') {
  writeFileSync(stampPath, `${worktreeTree()}\n`);
} else if (mode === 'check') {
  const verified = existsSync(stampPath) ? readFileSync(stampPath, 'utf8').trim() : '';
  process.exit(verified !== '' && verified === git(['write-tree']) ? 0 : 1);
} else {
  console.error('usage: verify-stamp.ts write|check');
  process.exit(2);
}
