import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parsePrivateWords, scanContent } from './private-scanner.ts';
import type { Finding } from './private-scanner.ts';

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function isMissing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isForbiddenFile(file: string) {
  const name = basename(file);
  return name === 'config.local.json' || name === '.private-words' || name.startsWith('.env');
}

export function readTrackedWorktree(root: string, file: string) {
  const target = join(root, file);
  try {
    const parts = file.split('/');
    for (let index = 1; index < parts.length; index++) {
      // lstat on the leaf alone follows parent symlinks and could open data outside the checkout.
      if (!lstatSync(join(root, ...parts.slice(0, index))).isDirectory()) throw new Error('Not a regular directory');
    }
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) return Buffer.from(readlinkSync(target));
    if (!stat.isFile()) throw new Error('Not a regular file');
    return readFileSync(target);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new Error('Unable to read tracked content', { cause: error });
  }
}

export function guardRepository(cwd: string, staged: boolean) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  const tracked = git(root, ['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
  const files = staged
    ? git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB', '-z'])
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
    : tracked;
  let words: string[] = [];
  let hasPrivateWords = false;
  // A private word list accidentally in the index is itself a leak; do not open it as configuration.
  if (!tracked.includes('.private-words')) {
    const wordPath = join(root, '.private-words');
    try {
      if (!lstatSync(wordPath).isFile()) throw new Error('Private word list must be a regular file');
      words = parsePrivateWords(readFileSync(wordPath, 'utf8'));
      hasPrivateWords = true;
    } catch (error) {
      if (!isMissing(error)) throw new Error('Unable to read private word list', { cause: error });
    }
  }
  const findings: Finding[] = [];
  for (const file of files) {
    if (isForbiddenFile(file)) {
      findings.push({ file, line: 1, rule: 'forbidden-file', masked: '**' });
      continue;
    }
    const content = staged ? git(root, ['show', `:${file}`]) : readTrackedWorktree(root, file);
    if (content) findings.push(...scanContent(file, content, words));
  }
  return { findings, hasPrivateWords, scannedFiles: files.length };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(
      'Usage: pnpm guard [--staged]\nDefault: scan tracked worktree files. The pre-commit hook scans staged content.\n',
    );
    return 0;
  }
  if (args.some((arg) => arg !== '--staged')) {
    process.stderr.write('guard-private: Unknown option. Use --help.\n');
    return 1;
  }
  try {
    const staged = args.includes('--staged') || process.env.HUB_GUARD_STAGED === '1';
    const result = guardRepository(process.cwd(), staged);
    if (!result.hasPrivateWords) process.stdout.write('guard-private: no private word list; built-in rules only.\n');
    for (const finding of result.findings) {
      process.stdout.write(`${JSON.stringify(finding.file)}:${finding.line}: ${finding.rule}: ${finding.masked}\n`);
    }
    process.stdout.write(
      `guard-private: ${result.scannedFiles} ${staged ? 'staged' : 'tracked'} files, ${result.findings.length} findings.\n`,
    );
    return result.findings.length === 0 ? 0 : 1;
  } catch (error) {
    const known =
      error instanceof Error &&
      ['Unable to read tracked content', 'Unable to read private word list'].includes(error.message);
    process.stderr.write(
      `guard-private: ${known && error instanceof Error ? error.message : 'Unable to inspect repository'}.\n`,
    );
    return 1;
  }
}

if (import.meta.main) process.exitCode = main();
