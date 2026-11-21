// Remembers the tree a green `pnpm verify` tested, so the pre-commit hook can skip a second full run on the same code.
// `tree`: prints the worktree tree hash (`git write-tree` in a scratch index).
// `write [expectedTree]`: stores the verified tree hash, refusing if the worktree changed since `expectedTree`.
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
  process.exit(verified !== '' && verified === git(['write-tree']) ? 0 : 1);
} else {
  console.error('usage: verify-stamp.ts tree|write [expectedTree]|check');
  process.exit(2);
}
